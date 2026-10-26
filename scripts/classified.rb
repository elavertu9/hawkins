# Encrypts the classified recipes in _classified/ (gitignored) into locked stubs
# in _recipes/ that are safe to commit. Run it through ./classified.sh.
#
# Each recipe is built with the real recipe layout in a throwaway copy of the
# site, then the rendered recipe is encrypted with the clearance code from
# .classified-code (gitignored): PBKDF2-SHA256 for the key, AES-256-GCM for the
# data. assets/js/classified.js does the same in reverse in the browser.
require "base64"
require "date"
require "fileutils"
require "json"
require "openssl"
require "tmpdir"
require "yaml"

ROOT = File.expand_path("..", __dir__)
CODE_FILE = File.join(ROOT, ".classified-code")
CLASSIFIED_DIR = File.join(ROOT, "_classified")
ITERATIONS = 310_000
START = "<!--classified:start-->"
FINISH = "<!--classified:end-->"
SKIP = %w[_site .git _classified .classified-code .jekyll-cache .jekyll-metadata vendor .bundle].freeze

# Must match normalize in assets/js/classified.js.
def normalize(code) = code.strip.gsub(/\s+/, " ").downcase

def key_for(code, salt)
  OpenSSL::KDF.pbkdf2_hmac(normalize(code), salt: salt, iterations: ITERATIONS, length: 32, hash: "sha256")
end

def encrypt(html, code)
  salt = OpenSSL::Random.random_bytes(16)
  iv = OpenSSL::Random.random_bytes(12)
  cipher = OpenSSL::Cipher.new("aes-256-gcm").encrypt
  cipher.key = key_for(code, salt)
  cipher.iv = iv
  cipher.auth_data = ""
  data = cipher.update(html) + cipher.final + cipher.auth_tag # Web Crypto wants the tag on the end
  { "iterations" => ITERATIONS, "salt" => Base64.strict_encode64(salt),
    "iv" => Base64.strict_encode64(iv), "data" => Base64.strict_encode64(data) }
end

def decrypt(box, code)
  raw = Base64.strict_decode64(box["data"])
  cipher = OpenSSL::Cipher.new("aes-256-gcm").decrypt
  cipher.key = OpenSSL::KDF.pbkdf2_hmac(normalize(code), salt: Base64.strict_decode64(box["salt"]),
                                        iterations: box["iterations"], length: 32, hash: "sha256")
  cipher.iv = Base64.strict_decode64(box["iv"])
  cipher.auth_tag = raw[-16..]
  cipher.auth_data = ""
  (cipher.update(raw[0...-16]) + cipher.final).force_encoding("UTF-8")
rescue StandardError
  nil
end

def front_matter(path)
  YAML.safe_load(File.read(path)[/\A---\s*\n(.*?)\n---/m, 1], permitted_classes: [Date])
end

abort "Put the clearance code in .classified-code first (one line)." unless File.exist?(CODE_FILE)
code = File.read(CODE_FILE).lines.first.to_s
abort ".classified-code is empty." if normalize(code).empty?

recipes = Dir[File.join(CLASSIFIED_DIR, "*.md")].sort
abort "No classified recipes in _classified/." if recipes.empty?

Dir.mktmpdir("hawkins-classified") do |tmp|
  # A copy of the site with the real classified recipes in place of the stubs.
  Dir.children(ROOT).reject { |name| SKIP.include?(name) }.each { |name| FileUtils.cp_r(File.join(ROOT, name), tmp) }
  recipes.each { |path| FileUtils.cp(path, File.join(tmp, "_recipes")) }
  system({ "BUNDLE_GEMFILE" => File.join(ROOT, "Gemfile") },
         "bundle", "exec", "jekyll", "build", "--quiet", "--source", tmp, "--destination", File.join(tmp, "_site"),
         exception: true)

  recipes.each do |path|
    slug = File.basename(path, ".md")
    page = File.read(File.join(tmp, "_site", "recipes", slug, "index.html"))
    html = page[/#{Regexp.escape(START)}(.*?)#{Regexp.escape(FINISH)}/m, 1] or abort "No recipe found in #{slug}."
    html = html.strip
    data = front_matter(path)
    stub_path = File.join(ROOT, "_recipes", "#{slug}.md")

    # Keep the existing encryption if it already holds this exact recipe, so
    # re-running doesn't change files for nothing.
    old = File.exist?(stub_path) ? front_matter(stub_path) : nil
    same = old && old["classified"] && old["cipher"] && decrypt(old["cipher"], code) == html

    stub = {
      "title" => data.fetch("title"),
      "category" => data.fetch("category"),
      "added" => data["added"],
      "classified" => true,
      "summary" => "Contents redacted. Level 4 clearance required to open this file.",
      "image" => data["image"],
      "image_alt" => data["image_alt"],
      "cipher" => same ? old["cipher"] : encrypt(html, code),
    }.compact
    text = [
      "---",
      "# Classified recipe, encrypted by ./classified.sh from _classified/#{slug}.md.",
      "# Edit that file (not this one), then run ./classified.sh again.",
      YAML.dump(stub).sub(/\A---\n/, "").chomp,
      "---",
      "",
    ].join("\n")
    if File.exist?(stub_path) && File.read(stub_path) == text
      puts "unchanged  #{slug}"
      next
    end
    File.write(stub_path, text)
    puts "#{same ? "updated   " : "encrypted "} #{slug}"
  end
end

var defaults = {

  // options passed to recast for parse and code formatting, see : https://github.com/benjamn/recast/blob/master/lib/options.js
  parserOptions: {},
  // root path used for relative path of html templates, use CWD if null
  templatesDir: null

}, hasOwn = defaults.hasOwnProperty


module.exports = function(options) {
  options = options || defaults
  function get(key) {
    return hasOwn.call(options, key) ? options[key] : defaults[key]
  }
  return {
    parserOptions: get("parserOptions"),
    templatesDir: get("templatesDir")
  }
}

var cheerio = require('cheerio'), fs = require('fs')

module.exports = function (path,selector,transfo,config){
  var dom = cheerio.load(fs.readFileSync(path).toString())(selector)
  domTransfo(dom,transfo)
  return dom2JSX(dom.get(0),config)
}

function domReplaceAttr(replace_in,attr,replace_spec,root){
  var replace_by = (typeof replace_spec === 'string') 
    ? replace_spec : replace_spec(replace_in.attr(attr),replace_in,root)
  replace_in.attr(attr,'{'+replace_by+'}')
}
function domReplaceInner(replace_in,replace_spec,root){
  var replace_by = (typeof replace_spec === 'string') 
    ? replace_spec : replace_spec(replace_in.html(),replace_in,root)
  replace_in.html('{'+replace_by+'}')
}

function domTransfo(elem,transfo){
  for(var selector in transfo){
      var replace_in = elem.find(selector), replace_spec = transfo[selector],
          is_attr_transfo = typeof replace_spec === 'object'
      if(is_attr_transfo)
        for(var attr in replace_spec)
          domReplaceAttr(replace_in,attr,replace_spec[attr],elem)
      else
        domReplaceInner(replace_in,replace_spec,elem)
  }
}

var defaultConfig = {
  createClass: true,
  indent: '  ',
  initLevel: 0
}
module.exports.defaultConfig = defaultConfig

//// custom JSX2HTML (inspired by npm project) to use directly HTMLParser2 elem API (and not DOM)
//// and to convert an attribute starting with "{" directly without string quotes
////
var ATTRIBUTE_MAPPING = {'for': 'htmlFor','class': 'className'}
var ELEMENT_ATTRIBUTE_MAPPING = {'input': {'checked': 'defaultChecked','value': 'defaultValue'}}

function trimEnd(haystack, needle) {
  return haystack.endsWith(needle) ? haystack.slice(0, -needle.length) : haystack
}
function hyphenToCamelCase(string) {
  return string.replace(/-(.)/g, function(match, chr) {
    return chr.toUpperCase()
  })
}
function isElement(node){
  return node.type === "tag" || node.type === "script" || node.type === "style"
}
function toJSXValue(value) {
  if (isNumeric(value)) {
    return value
  } else if (isConvertiblePixelValue(value)) {
    return trimEnd(value, 'px')
  } else {
    return '\'' + value.replace(/'/g, '"') + '\''
  }
}
function isEmpty(string) {
   return !/[^\s]/.test(string)
}
function isConvertiblePixelValue(value) {
  return /^\d+px$/.test(value)
}
function isNumeric(input) {
  return input !== undefined
    && input !== null
    && (typeof input === 'number' || parseInt(input, 10) == input)
}

function escapeSpecialChars(value) {
  return (String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;'))
}

function stylesHTML2Obj(rawStyle){
  var styles = {}
  rawStyle.split(';').forEach(function(style) {
    style = style.trim()
    var firstColon = style.indexOf(':')
    var key = style.substr(0, firstColon)
    var value = style.substr(firstColon + 1).trim()
    if (key !== '') {
      styles[key] = value
    }
  })
  return styles
}

function stylesObj2JSX(styles){
  var output = []
  for (var key in styles) {
    if (!styles.hasOwnProperty(key)) continue
    output.push(hyphenToCamelCase(key) + ': ' + toJSXValue(styles[key]))
  }
  return output.join(', ')
}

var dom2JSXState = function(config) {
  config = config || {}
  this.config = {}
  this.config.createClass = config.createClass || defaultConfig.createClass || true
  this.config.indent = config.indent || defaultConfig.indent || true
  this.config.initLevel = config.initLevel || defaultConfig.initLevel || 0
}
dom2JSXState.prototype = {
  convert: function(containerEl) {
    this.output = ''
    this.level = this.config.initLevel

    if (this.config.createClass) {
      this.output = 'React.createClass({\n'
      this.output += this.config.indent.repeat(this.level) + 'render: function() {' + "\n"
      this.output += this.config.indent.repeat(this.level + 1) + 'return (\n'
    }

    if (this._onlyOneTopLevel(containerEl)) {
      // Only one top-level element, the component can return it directly
      // No need to actually visit the container element
      this._traverse(containerEl)
    } else {
      // More than one top-level element, need to wrap the whole thing in a
      // container.
      this.output += this.config.indent.repeat(this.level + 3) 
      this.level++
      this._visit(containerEl)
      this.level--
    }
    this.output = this.output.trim() + '\n'
    this.level = this.config.initLevel
    if (this.config.createClass) {
      this.output += this.config.indent.repeat(this.level + 1) + ')\n'
      this.output += this.config.indent.repeat(this.level) + '}\n'
      var close_level = (this.level > 0) ? this.level-1 : 0
      this.output += this.config.indent.repeat(close_level) + '})'
    }
    return this.output
  },

  _cleanInput: function(html) {
    // Remove unnecessary whitespace
    html = html.trim()
    // Ugly method to strip script tags. They can wreak havoc on the DOM nodes
    // so let's not even put them in the DOM.
    html = html.replace(/<script([\s\S]*?)<\/script>/g, '')
    return html
  },

  _onlyOneTopLevel: function(containerEl) {
    // Only a single child element
    var childs = containerEl.children
    if (
      childs.length === 1 && isElement(childs[0])
    ) {
      return true
    }
    // Only one element, and all other children are whitespace
    var foundElement = false
    for (var i = 0, count = childs.length; i < count; i++) {
      var child = childs[i]
      if (isElement(child)) {
        if (foundElement) {
          // Encountered an element after already encountering another one
          // Therefore, more than one element at root level
          return false
        } else {
          foundElement = true
        }
      } else if (child.type === 'text' && !isEmpty(child.textContent)) {
        // Contains text content
        return false
      }
    }
    return true
  },

  _getIndentedNewline: function() {
    return '\n' + this.config.indent.repeat(this.level + 2)
  },

  _visit: function(node) {
    this._beginVisit(node) ; this._traverse(node) ; this._endVisit(node)
  },

  _traverse: function(node) {
    this.level++
    if(node.children) 
      for (var child of node.children) 
        this._visit(child)
    this.level--
  },

  _beginVisit: function(node) {
    if (isElement(node))
      this._beginVisitElement(node)
    else if(node.type === "text")
      this._visitText(node)
    else if(node.type === "comment")
      this._visitComment(node)
    else
      console.warn('Unrecognised node type: ' + node.type)
  },

  _endVisit: function(node) {
    if (isElement(node))
      this._endVisitElement(node)
  },

  _beginVisitElement: function(node) {
    var tagName = node.name.toLowerCase()
    var attributes = []
    for (var attr in node.attribs) attributes.push(this._getElementAttribute(node,attr,node.attribs[attr]))

    this.output += '<' + tagName
    if (attributes.length > 0) this.output += ' ' + attributes.join(' ')
    if (node.firstChild) this.output += '>'
  },

  _endVisitElement: function(node) {
    this.output = trimEnd(this.output, this.config.indent)
    this.output += !node.firstChild ? ' />' : ('</' + node.name.toLowerCase() + '>')
  },

  _visitText: function(node) {
    var text = node.data
    // If there's a newline in the text, adjust the indent level
    if (text.indexOf('\n') > -1) {
      text = node.data.replace(/\n\s*/g, this._getIndentedNewline())
    }
    this.output += escapeSpecialChars(text)
  },

  _visitComment: function(node) {
    // Do not render the comment
    this.output += '{/*' + node.data.replace('*/', '* /') + '*/}'
  },

  _getElementAttribute: function(node, name, value) {
    switch (name) {
      case 'style':
        return this._getStyleAttribute(value)
      default:
        var tagName = node.name.toLowerCase()
        var name =
          (ELEMENT_ATTRIBUTE_MAPPING[tagName] &&
            ELEMENT_ATTRIBUTE_MAPPING[tagName][name]) ||
          ATTRIBUTE_MAPPING[name] ||
          name
        var result = name

        // Numeric values should be output as {123} not "123"
        if (isNumeric(value)) {
          result += '={' + value + '}'
        } else if (value.length > 0) {
          if (value[0] === "{") {
            result += '=' + value
          }else{
            result += '="' + value.replace('"', '&quot;') + '"'
          }
        }
        return result
    }
  },

  _getStyleAttribute: function(styles) {
    var jsxStyles = stylesObj2JSX(stylesHTML2Obj(styles))
    return 'style={{' + jsxStyles + '}}'
  }
}

function dom2JSX(node,config){
  return new dom2JSXState(config).convert(node)
}

//// End of custom JSX2HTML 

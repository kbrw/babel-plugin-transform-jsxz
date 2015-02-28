var htmlParser = require("htmlparser2"), 
    cssSelector = require("css-select"),
    fs = require("fs"),
    recast = require("recast"),
    types = require("ast-types"),
    n = types.namedTypes,
    b = types.builders

function parseJSXsSpec(ast,sourceFile,callback){
  function error(msg,sourceAst){
    var err = new Error()
    err.message = msg
    err.name = "JSXs Exception"
    err.fileName = sourceFile
    err.lineNumber = sourceAst.loc.start.line
    err.columnNumber = sourceAst.loc.start.column
    err.stack = err.name+": "+msg+"\n    at "+sourceAst.type+" ("+sourceFile+":"+err.lineNumber+":"+err.columnNumber+")\n"
    throw err
  }
  var opentag = ast.openingElement
  var htmlPathAttr = opentag.attributes.filter(function(attr){return attr.name.name == "file"})[0]
  if(!htmlPathAttr)
    error("jsxZ attribute 'file' necessary",path.node)
  if(htmlPathAttr.value.type !== 'Literal')
    error("jsxZ 'file' must be an hardcoded string",htmlPathAttr.value)
  var htmlPath = htmlPathAttr.value.value

  var selectorAttr = opentag.attributes.filter(function(attr){return attr.name.name == "sel"})[0]
  if(selectorAttr && selectorAttr.value.type !== 'Literal')
    error("jsxZ 'sel' must be an hardcoded CSS selector",selectorAttr.value)
  var rootSelector = selectorAttr && selectorAttr.value.value

  transfos = ast.children
    .filter(function(c){return c.type==='XJSElement'})
    .map(function(c){
      if(c.openingElement.name.name !== "Z")
        error("Only accepted childs for jsxZ are 'Z'",c.openingElement)
      var selectorAttr = c.openingElement.attributes.filter(function(attr){return attr.name.name == "sel"})[0]
      if(!selectorAttr || selectorAttr.value.type !== 'Literal')
        error("jsxZ 'sel' must be an hardcoded CSS selector",selectorAttr.value)
      
      var swapAttr = c.openingElement.attributes.filter(function(attr){return attr.name.name == "swap"})[0]
      var swap = swapAttr && (swapAttr.value.value == "true")

      var otherAttrs = c.openingElement.attributes.filter(function(attr){ return attr.name.name !== 'swap' && attr.name.name !== 'sel'})
      return {selector: selectorAttr.value.value, swap: swap, attrs: otherAttrs, children: c.children}
    })

  fs.readFile(htmlPath,function(err,data){
    if(err) error("Impossible to read html file "+htmlPath,htmlPathAttr.value)
    callback({htmlFile: data.toString(), htmlPath: htmlPath, rootSelector:  rootSelector, transfos: transfos})
  })
}

function parseDom(jsxZ,callback){
  var parser = new htmlParser.Parser(
    new htmlParser.DomHandler(function (error, dom) {
      if (error) throw new Error("Too much malformed HTML "+jsxZ.htmlPath)
      if (jsxZ.rootSelector){
        dom = cssSelector.selectOne(jsxZ.rootSelector,dom)
        if (!dom) throw new Error("selector "+jsxZ.rootSelector+" does not match any node in "+ jsxZ.htmlPath)
      }
      callback(dom)
    }))
  parser.write(jsxZ.htmlFile)
  parser.done()
}

function parseSourceAst(sourceFile,callback){
  fs.readFile(sourceFile,function(err,data){
    if (err) throw new Error("impossible to find source file "+sourceFile)
    var sourceAst = recast.parse(data.toString())
    var jsxZPaths = []
    types.visit(sourceAst.program.body,{
      visitXJSElement: function(path){
        this.traverse(path)
        if(path.node.openingElement.name.name === "jsxZ") jsxZPaths.push(path)
      }
    })
    callback(sourceAst,jsxZPaths)
  })
}

function domStyleToJSX(style){
  return null
}

var ATTRIBUTE_MAPPING = {for: 'htmlFor',class: 'className'}
var ELEMENT_ATTRIBUTE_MAPPING = {input: {checked: 'defaultChecked',value: 'defaultValue'}}
function domAttrToJSX(tag,attrName,attrValue){
  var astAttrName = (ELEMENT_ATTRIBUTE_MAPPING[tag] && ELEMENT_ATTRIBUTE_MAPPING[tag][attrName])
                    || ATTRIBUTE_MAPPING[attrName] || attrName
  if (tag === 'style'){
    var astAttrValue = domStyleToJSX(attrValue)
  }else if(isNumeric(attrValue)){
    var astAttrValue = b.xjsExpressioncontainer(
                         b.literal(parseInt(attrValue, 10)))
  }else{
    var astAttrValue = b.literal(attrValue)
  }
  return b.xjsAttribute(b.xjsIdentifier(astAttrName),astAttrValue)
}

var tagIndex = 0
function domToAst(dom){
  tagIndex++
  if (dom.type==='tag'){
    var astTag = dom.name.toLowerCase()
    var astAttribs = Object.keys(dom.attribs).map(function(attrName){
      return domAttrToJSX(astTag,attrName,dom.attribs[attrName])
    })
    var ast = b.xjsElement(
      b.xjsOpeningElement(b.xjsIdentifier(astTag),astAttribs),
      b.xjsClosingElement(b.xjsIdentifier(astTag)),
        dom.children.filter(
          function(child){return child.type === 'text' || child.type === 'tag'}
        ).map(domToAst))
    ast.tagIndex = tagIndex.toString() // associate tag ast node to dom to map selector to ast transfos
    dom.tagIndex = tagIndex.toString() // use string index to use object as hash map
    return ast
  }else if(dom.type==='text'){
    return b.literal(dom.data)
  }
}

function searchTransfosByTagIndex(jsxZ,dom){
  var map = {}
  jsxZ.transfos.map(function(transfo){
    var matchingNodes = cssSelector(transfo.selector,dom)
    if (matchingNodes.length == 0){
      console.warn("Transfo "+transfo.selector+" does not match anything")
      return []
    }
    matchingNodes.map(function(dom){
      map[dom.tagIndex] = JSON.parse(JSON.stringify(transfo))
    })
  })
  return map
}

function applyTransfo(path,transfo){
  if(transfo.swap) path.get().replace(transfo.children)
  else path.get("children").replace(transfo.children)
}

module.exports = function (sourceFile,callback){
  parseSourceAst(sourceFile,function(sourceAst,jsxZPaths){
    var remaining = jsxZPaths.length
    function done(){ remaining--; if(remaining === 0)
      callback(recast.prettyPrint(sourceAst).code)
    }
    jsxZPaths.map(function(path){
      parseJSXsSpec(path.node,sourceFile,function(jsxZ){
        parseDom(jsxZ,function(dom){
          var domAst = domToAst(dom)
          var transfosByTagIndex = searchTransfosByTagIndex(jsxZ,dom)
          types.visit(domAst,{
            visitXJSElement: function(subpath){
              this.traverse(subpath)
              if (transfo=transfosByTagIndex[subpath.node.tagIndex])
                applyTransfo(subpath,transfo)
            }
          })
          path.get().replace(domAst)
          done()
        })
      })
    })
  })
}

function trimEnd(haystack, needle) {
  return haystack.endsWith(needle) ? haystack.slice(0, -needle.length) : haystack
}
function hyphenToCamelCase(string) {
  return string.replace(/-(.)/g, function(match, chr) {
    return chr.toUpperCase()
  })
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

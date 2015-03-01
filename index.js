var htmlParser = require("htmlparser2"), 
    cssSelector = require("css-select"),
    fs = require("fs"),
    path = require("path"),
    recast = require("recast"),
    types = require("ast-types"),
    n = types.namedTypes,
    b = types.builders

function error(msg,sourceAst){
  var err = new Error()
  err.message = msg
  err.name = "JSXZ Exception"
  err.lineNumber = sourceAst.loc.start.line
  err.columnNumber = sourceAst.loc.start.column + 1
  throw err
}

function parseJSXsSpec(ast,options,callback){
  var opentag = ast.openingElement
  var htmlPathAttr = opentag.attributes.filter(function(attr){return attr.name.name == "in"})[0]
  if(!htmlPathAttr)
    error("jsxZ attribute 'in' necessary",ast.openingElement)
  if(htmlPathAttr.value.type !== 'Literal')
    error("jsxZ 'in' must be an hardcoded string",htmlPathAttr.value)
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
        error("Z 'sel' attribute is mandatory and must be a hardcoded CSS selector",selectorAttr && selectorAttr.value || c.openingElement)
      
      var tagAttr = c.openingElement.attributes.filter(function(attr){return attr.name.name == "tag"})[0]
      var tag = tagAttr && tagAttr.value.value

      var otherAttrs = c.openingElement.attributes.filter(function(attr){ return attr.name.name !== 'tag' && attr.name.name !== 'sel'})
      return {selector: selectorAttr.value.value, tag: tag, attrs: otherAttrs, node: c,selNode: selectorAttr.value}
    })
  var tagAttr = ast.openingElement.attributes.filter(function(attr){return attr.name.name == "tag"})[0]
  var tag = tagAttr && tagAttr.value.value
  var otherAttrs = ast.openingElement.attributes.filter(function(attr){ return attr.name.name !== 'tag' && attr.name.name !== 'sel' && attr.name.name !== "in"})
  transfos.push({tag: tag, attrs: otherAttrs})

  if (htmlPath.indexOf(".html", htmlPath.length - 5) === -1){
    htmlPath = htmlPath + ".html"
  }
  if (options.templatesDir && htmlPath[0] !== "/"){
    htmlPath = options.templatesDir + "/" + htmlPath
  }
  try{
    var data = fs.readFileSync(htmlPath)
  }catch(e){
    error("Impossible to read html file "+htmlPath,htmlPathAttr.value)
  }
  return {htmlFile: data.toString(), htmlPath: htmlPath, rootSelector:  rootSelector, transfos: transfos, node: ast, selNode: selectorAttr.value}
}

function parseDom(jsxZ,callback){
  var parser = new htmlParser.Parser(
    new htmlParser.DomHandler(function (err, dom) {
      if (err) err("Too much malformed HTML "+jsxZ.htmlPath,jsxZ.node)
      if (jsxZ.rootSelector){
        var dom = cssSelector.selectOne(jsxZ.rootSelector,dom)
        if (!dom) error("selector "+jsxZ.rootSelector+" does not match any node in "+ jsxZ.htmlPath,jsxZ.selNode)
      }
      callback(dom)
    }))
  parser.write(jsxZ.htmlFile)
  parser.done()
}

function extractJsxzPaths(sourceAst,callback){
  var jsxZPaths = []
  types.visit(sourceAst.program.body,{
    visitXJSElement: function(path){
      this.traverse(path)
      if(path.node.openingElement.name.name === "JSXZ") jsxZPaths.push(path)
    }
  })
  return jsxZPaths
}

function domStyleToJSX(style){
  var styleObj = stylesHTML2Obj(style)
  return b.xjsExpressionContainer(
    b.objectExpression(Object.keys(styleObj).map(function(key){
      return b.property("init",b.identifier(hyphenToCamelCase(key)),
                               b.literal(toJSXValue(styleObj[key])))
    }))
  )
}

var ATTRIBUTE_MAPPING = {for: 'htmlFor',class: 'className'}
var ELEMENT_ATTRIBUTE_MAPPING = {input: {checked: 'defaultChecked',value: 'defaultValue'}}
function domAttrToJSX(tag,attrName,attrValue){
  var astAttrName = (ELEMENT_ATTRIBUTE_MAPPING[tag] && ELEMENT_ATTRIBUTE_MAPPING[tag][attrName])
                    || ATTRIBUTE_MAPPING[attrName] || attrName
  if (astAttrName === 'style'){
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

function searchTransfosByTagIndex(jsxZ,rootdom){
  var map = {}
  jsxZ.transfos.map(function(transfo){
    var matchingNodes = transfo.selector && cssSelector(transfo.selector,rootdom) || [rootdom]
    if (matchingNodes.length == 0){
      throw error("Transfo "+transfo.selector+" does not match anything in "+jsxZ.htmlPath,transfo.selNode)
      return []
    }
    matchingNodes.map(function(subdom,i){
      map[subdom.tagIndex] = {i: i,transfo: JSON.parse(JSON.stringify(transfo))}
    })
  })
  return map
}

function attributesMap(attrs,nameFun,valueFun){
  map = {}
  attrs.forEach(function(attr){
    map[nameFun && nameFun(attr.name.name) || attr.name.name] = 
      valueFun && valueFun(attr.value) || attr.value
  })
  return map
}

function removeOverwrittenAttrs(attrsPath,newAttrs){
  var newAttrsSet = attributesMap(newAttrs,function(name){return name},function(_){return true})
  attrsPath.value.forEach(function(attr,i){
    if(newAttrsSet[attr.name.name]) attrsPath.get(i).replace()
  })
}

function genSwapMap(attrs,nodeIndex){
  var swapMap = attributesMap(attrs,function(name){return name+'Z'},function(value){return value})
  swapMap["indexZ"] = b.literal(nodeIndex)
  return swapMap
}

function alterAttributes(path,transfo,swapMap){
  var attrsPath = path.get("openingElement","attributes")
  removeOverwrittenAttrs(attrsPath,transfo.attrs)
  types.visit(transfo.attrs,{
    visitIdentifier: function(path){
      if(swapMap[path.node.name])
        path.get().replace(swapMap[path.node.name])
      return false // identifier is
    }
  })
  attrsPath.push.apply(attrsPath,transfo.attrs.filter(function(attr){
    return !(attr.value.type == "XJSExpressionContainer" && attr.value.expression.type == "Identifier" && attr.value.expression.name == "undefined")
  }))
}

function alterTag(path,transfo,swapMap){
  if(transfo.tag){
    path.get("openingElement","name").replace(b.xjsIdentifier(transfo.tag))
    if(path.node.closingElement)
      path.get("closingElement","name").replace(b.xjsIdentifier(transfo.tag))
  }
}

function alterChildren(path,transfo,swapMap){
  if(transfo.node){ // no children alteration if no "node" transfo attribute
    types.visit(transfo.node,{
      visitIdentifier: function(path){
        if(swapMap[path.node.name])
          path.get().replace(swapMap[path.node.name])
        return false // identifier is
      },
      visitXJSElement: function(elemPath){
        this.traverse(elemPath)
        var childrenZIndexes = []
        var nbInsertion = 0
        elemPath.node.children.forEach(function(n,i){
          if(n.type == "XJSElement" && n.openingElement.name.name == "ChildrenZ"){
            var insertionOffset = nbInsertion*(path.node.children.length - 1)
            childrenZIndexes.push(i + insertionOffset)
            nbInsertion++
          }
        })
        childrenZIndexes.forEach(function(i){
          var children = JSON.parse(JSON.stringify(path.node.children))
          elemPath.node.children.splice.apply(elemPath.node.children,[i,1].concat(children))
        })
      }
    })
    path.get("children").replace(transfo.node.children)
  }
}

function domAstZTransfo(domAst,jsxZ,dom){
  var transfosByTagIndex = searchTransfosByTagIndex(jsxZ,dom)
  types.visit(domAst,{
    visitXJSElement: function(subpath){
      this.traverse(subpath)
      if (transfoIndexed=transfosByTagIndex[subpath.node.tagIndex]){
        var transfo = transfoIndexed.transfo,
            swapMap = genSwapMap(subpath.node.openingElement.attributes,transfoIndexed.i)
        alterAttributes(subpath,transfo,swapMap)
        alterTag(subpath,transfo,swapMap)
        alterChildren(subpath,transfo,swapMap)
      }
    }
  })
}

module.exports = function (source,optionsOrCallback,callback){
  options = require('./options')(callback && optionsOrCallback || {})
  callback = callback || optionsOrCallback
  htmlDependencies = {}
  var sourceAst = recast.parse(source,options.parserOptions)
  try{
    var jsxZPaths = extractJsxzPaths(sourceAst)
    var next = function(){
      if(jsxzPath = jsxZPaths.shift()){
        jsxZ = parseJSXsSpec(jsxzPath.node,options)
        parseDom(jsxZ,function(dom){
          var domAst = domToAst(dom)
          domAstZTransfo(domAst,jsxZ,dom)
          jsxzPath.get().replace(domAst)
          htmlDependencies[path.resolve(jsxZ.htmlPath)] = true
          next()
        })
      }else{
        callback(null,recast.print(sourceAst,options.parserOptions),Object.keys(htmlDependencies))
      }
    };next()
  }catch(e){
    if(e.name !== "JSXZ Exception") throw e
    callback("JSXZ Error: "+e.message+" at "+e.lineNumber+":"+e.columnNumber,recast.print(sourceAst,options.parserOptions),Object.keys(htmlDependencies))
  }
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
    return parseInt(value, 10)
  } else if (isConvertiblePixelValue(value)) {
    return parseInt(trimEnd(value, 'px'), 10)
  } else {
    return value
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
    if (key !== '') 
      styles[key] = value
  })
  return styles
}

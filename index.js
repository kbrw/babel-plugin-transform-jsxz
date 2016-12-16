var htmlParser = require("htmlparser2"),
    cssSelector = require("css-select"),
    fs = require("fs"),
    deepcopy = require("deepcopy"),
    bab = require("babylon"),
    traverse = require('babel-traverse').default,
    generate = require('babel-generator').default,
    t = require("babel-types"),
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
  if(htmlPathAttr.value.type !== 'StringLiteral')
    error("jsxZ 'in' must be an hardcoded string",htmlPathAttr.value)
  var htmlPath = htmlPathAttr.value.value

  var selectorAttr = opentag.attributes.filter(function(attr){return attr.name.name == "sel"})[0]
  if(selectorAttr && selectorAttr.value.type !== 'StringLiteral')
    error("jsxZ 'sel' must be an hardcoded CSS selector",selectorAttr.value)
  var rootSelector = selectorAttr && selectorAttr.value.value

  transfos = ast.children
    .filter(function(c){return c.type==='JSXElement'})
    .map(function(c){
      if(c.openingElement.name.name !== "Z")
        error("Only accepted childs for jsxZ are 'Z'",c.openingElement)
      var selectorAttr = c.openingElement.attributes.filter(function(attr){return attr.name.name == "sel"})[0]
      if(!selectorAttr || selectorAttr.value.type !== 'StringLiteral')
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

function syncForEach(leftOrRight,list,then,end){
  var next = function(){
    if(elem = (leftOrRight == "left" ? list.shift() : list.pop())){
      then(elem,next)
    }else{
      end()
    }
  };next()
}

function extractJsxzPaths(sourceAst){
  var jsxZPaths = []
  traverse(sourceAst,{
    JSXElement(path){
      if(path.node.openingElement.name.name === "JSXZ") jsxZPaths.push(path)
    }
  })
  return jsxZPaths
}

function domStyleToJSX(style){
  var styleObj = stylesHTML2Obj(style)
  return t.jSXExpressionContainer(
    t.objectExpression(Object.keys(styleObj).map(function(key){
      return t.objectProperty(t.identifier(hyphenToCamelCase(key)),toJSXValue(styleObj[key]))
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
    var astAttrValue = t.jSXExpressionContainer(
                         t.stringLiteral(parseInt(attrValue, 10)))
  }else{
    var astAttrValue = t.stringLiteral(attrValue)
  }
  return t.jSXAttribute(t.jSXIdentifier(astAttrName),astAttrValue)
}

function domToAst(dom,tagIndex){
  if (dom.type==='tag'){
    var astTag = dom.name.toLowerCase()
    var astAttribs = Object.keys(dom.attribs).map(function(attrName){
      return domAttrToJSX(astTag,attrName,dom.attribs[attrName])
    })
    var ast = t.jSXElement(
      t.jSXOpeningElement(t.jSXIdentifier(astTag),astAttribs),
      t.jSXClosingElement(t.jSXIdentifier(astTag)),
        dom.children.filter(
          function(child){return child.type === 'text' || child.type === 'tag'}
        ).map(function(child){
          var ast = domToAst(child,tagIndex)
          tagIndex=ast.tagIndex
          return ast
        }))
  }else if(dom.type==='text'){
    var ast = t.jSXText(dom.data)
  }
  ast.tagIndex = tagIndex + 1 // associate tag ast node to dom to map selector to ast transfos
  dom.tagIndex = ast.tagIndex // use string index to use object as hash map
  return ast
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
      map[subdom.tagIndex] = {i: i,transfo: deepcopy(transfo)}
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
  attrsPath.forEach(function(attr){
    if(newAttrsSet[attr.node.name.name]) attr.remove()
  })
}

function genSwapMap(attrs,nodeIndex){
  var swapMap = attributesMap(attrs,function(name){return name+'Z'},function(value){return value})
  swapMap["indexZ"] = t.numericLiteral(nodeIndex)
  return swapMap
}

function alterAttributes(path,transfo,swapMap){
  var attrsPath = path.get("attributes")
  removeOverwrittenAttrs(attrsPath,transfo.attrs)
  var fakeAst = t.blockStatement([t.ExpressionStatement(
    t.jSXElement(t.jSXOpeningElement(t.jSXIdentifier("fake"),transfo.attrs),null,[],true)
  )])
  traverse(fakeAst,{
    Identifier(path){
      if(swapMap[path.node.name])
        path.replaceWith(swapMap[path.node.name])
    }
  },path.scope,path)
  attrsPath,transfo.attrs.filter(function(attr){
    return !(attr.value.type == "JSXExpressionContainer" && attr.value.expression.type == "Identifier" && attr.value.expression.name == "undefined")
  }).map(function(attr){
    path.pushContainer("attributes",attr)
  })
}

function alterTag(path,transfo,swapMap){
  if(transfo.tag){
    path.get("openingElement.name").replaceWith(t.jSXIdentifier(transfo.tag))
    if(path.node.closingElement)
      path.get("closingElement.name").replaceWith(t.jSXIdentifier(transfo.tag))
  }
}

function alterChildren(path,transfo,swapMap){
  if(transfo.node){ // no children alteration if no "node" transfo attribute
    var fakeRoot = t.blockStatement([t.ExpressionStatement(transfo.node)])
    traverse(fakeRoot,{
      Identifier(path) {
        if(swapMap[path.node.name])
          path.replaceWith(swapMap[path.node.name])
      },
      JSXElement(elemPath) {
        if(elemPath.node.openingElement.name.name == "ChildrenZ"){
          var children = deepcopy(path.node.children)
          //console.log(elemPath.node)
          //console.log(elemPath.parentPath.node)
          //console.log(elemPath.getSibling(0).node)
          if(elemPath.parentPath.node.type ==='JSXElement'){
            var prev_children = deepcopy(elemPath.parentPath.node.children)
            elemPath.parentPath.get('children').map(function(child){ child.remove() })
            console.log(elemPath)
            console.log("must replace key "+elemPath.key)
            prev_children.map(function(prev_child){
              if(prev_child.type =='JSXElement' && prev_child.openingElement.name.name == "ChildrenZ"){ 
                children.map(function(new_child){
                  elemPath.parentPath.pushContainer('children',new_child)
                })
              }else{
                elemPath.parentPath.pushContainer('children',prev_child)
              }
            })
          }else{
            elemPath.replaceWithMultiple(children)
          }
          //  children.map(function(child){
          //    console.log("insert : ")
          //    console.log(elemPath.parentPath.node)
          //    console.log(child)
          //    elemPath.insertBefore(child)
          //  })
          //  elemPath.remove()
          //}
        }
      }
    },path.scope,path)
    path.node.children = transfo.node.children
  }
}

function domAstZTransfo(domAst,jsxzPath,jsxZ,dom){
  var transfosByTagIndex = searchTransfosByTagIndex(jsxZ,dom)
  var fakeRoot = t.blockStatement([t.ExpressionStatement(domAst)])
  traverse(fakeRoot,{
    JSXElement: {
      exit(subpath) {
        if (transfoIndexed=transfosByTagIndex[subpath.node.tagIndex]){
          //console.log("enter "+jsxZ.htmlPath + " / "+jsxZ.rootSelector+" : "+subpath.get("openingElement").node.name.name)
          var transfo = transfoIndexed.transfo,
              swapMap = genSwapMap(subpath.node.openingElement.attributes,transfoIndexed.i)
          //console.log(transfo)
          alterAttributes(subpath.get("openingElement"),transfo,swapMap)
          alterTag(subpath,transfo,swapMap)
          alterChildren(subpath,transfo,swapMap)
        }
      }
    }
  },jsxzPath.scope,jsxzPath)
}

module.exports = function (source,optionsOrCallback,callback){
  options = require('./options')(callback && optionsOrCallback || {})
  callback = callback || optionsOrCallback
  htmlDependencies = {}
  //var sourceAst = recast.parse(source,options.parserOptions)
  var code = source.toString()
  var sourceAst = bab.parse(code,{sourceType: "module", plugins: ["jsx","flow","objectRestSpread"] })
  var currentTagIndex = 0
  try{
    syncForEach("right",extractJsxzPaths(sourceAst),function(jsxzPath,next){
      jsxZ = parseJSXsSpec(jsxzPath.node,options)
      //console.log(jsxZ)
      parseDom(jsxZ,function(dom){
        var domAst = domToAst(dom,currentTagIndex)
        currentTagIndex = domAst.tagIndex
        domAstZTransfo(domAst,jsxzPath,jsxZ,dom)
        jsxzPath.replaceWith(domAst)
        htmlDependencies[path.resolve(jsxZ.htmlPath)] = true
        next()
      })
    },function(){
      callback(null,generate(sourceAst,null,code),Object.keys(htmlDependencies))
    })
  }catch(e){
    if(e.name !== "JSXZ Exception") throw e
    callback("JSXZ Error: "+e.message+" at "+e.lineNumber+":"+e.columnNumber,recast.print(sourceAst,options.parserOptions),Object.keys(htmlDependencies))
  }
}

function trimEnd(haystack, needle) {
  return (haystack.indexOf(needle,haystack.length-needle.length) !== -1) ? haystack.slice(0, -needle.length) : haystack
}
function hyphenToCamelCase(string) {
  return string.replace(/-(.)/g, function(match, chr) {
    return chr.toUpperCase()
  })
}
function toJSXValue(value) {
  if (isNumeric(value)) {
    return t.numericLiteral(parseInt(value, 10))
  } else if (isConvertiblePixelValue(value)) {
    return t.numericLiteral(parseInt(trimEnd(value, 'px'), 10))
  } else {
    return t.stringLiteral(value)
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

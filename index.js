var htmlParser = require("htmlparser2"),
    cssSelector = require("css-select"),
    fs = require("fs"),
    deepcopy = require("deepcopy"),
    traverse = require('babel-traverse').default,
    t = require("babel-types"),
    path = require("path")

function error(msg,node, path){
  var loc = node && (node.loc || node._loc)
  var err = new SyntaxError(msg)
  var errorVisitor = {
    enter(path, state) {
      var loc = path.node.loc
      if (loc) {
        state.loc = loc
        path.stop()
      }
    }
  }
  if (loc) {
    err.loc = loc.start;
  } else if(path) {
    traverse(node, errorVisitor, path.scope, err)
    err.message += " (This is an error on an internal node. Probably an internal error"
    if (err.loc) { err.message += ". Location has been estimated." }
    err.message += ")"
  }
  throw err
}

function parseJSXsSpec(path,options,callback){
  var ast = path.node
  var opentag = ast.openingElement
  var htmlPathAttr = opentag.attributes.filter(function(attr){return attr.name.name == "in"})[0]
  if(!htmlPathAttr)
    error("jsxZ attribute 'in' necessary",ast.openingElement,path)
  if(htmlPathAttr.value.type !== 'StringLiteral')
    error("jsxZ 'in' must be an hardcoded string",htmlPathAttr.value,path)
  var htmlPath = htmlPathAttr.value.value

  var selectorAttr = opentag.attributes.filter(function(attr){return attr.name.name == "sel"})[0]
  if(selectorAttr && selectorAttr.value.type !== 'StringLiteral')
    error("jsxZ 'sel' must be an hardcoded CSS selector",selectorAttr.value,path)
  var rootSelector = selectorAttr && selectorAttr.value.value

  transfos = ast.children
    .filter(function(c){return c.type==='JSXElement'})
    .map(function(c){
      if(c.openingElement.name.name !== "Z")
        error("Only accepted childs for jsxZ are 'Z'",c.openingElement,path)
      var selectorAttr = c.openingElement.attributes.filter(function(attr){return attr.name.name == "sel"})[0]
      if(!selectorAttr || selectorAttr.value.type !== 'StringLiteral')
        error("Z 'sel' attribute is mandatory and must be a hardcoded CSS selector",selectorAttr && selectorAttr.value || c.openingElement,path)

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
    error("Impossible to read html file "+htmlPath,htmlPathAttr.value, path)
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

var ATTRIBUTE_MAPPING = {
  'for': 'htmlFor','class': 'className',
  'accept-charset': 'acceptCharset',
  'accesskey': 'accessKey',
  'allowfullscreen': 'allowFullScreen',
  'allowtransparency': 'allowTransparency',
  'autocomplete': 'autoComplete',
  'autofocus': 'autoFocus',
  'autoplay': 'autoPlay',
  'cellpadding': 'cellPadding',
  'cellspacing': 'cellSpacing',
  'charset': 'charSet',
  'classid': 'classID',
  'colspan': 'colSpan',
  'contenteditable': 'contentEditable',
  'contextmenu': 'contextMenu',
  'crossorigin': 'crossOrigin',
  'datetime': 'dateTime',
  'enctype': 'encType',
  'formaction': 'formAction',
  'formenctype': 'formEncType',
  'formmethod': 'formMethod',
  'formnovalidate': 'formNoValidate',
  'formtarget': 'formTarget',
  'frameborder': 'frameBorder',
  'hreflang': 'hrefLang',
  'http-equiv': 'httpEquiv',
  'inputmode': 'inputMode',
  'keyparams': 'keyParams',
  'keytype': 'keyType',
  'marginheight': 'marginHeight',
  'marginwidth': 'marginWidth',
  'maxlength': 'maxLength',
  'mediagroup': 'mediaGroup',
  'minlength': 'minLength',
  'novalidate': 'noValidate',
  'radiogroup': 'radioGroup',
  'readonly': 'readOnly',
  'rowspan': 'rowSpan',
  'spellcheck': 'spellCheck',
  'srcdoc': 'srcDoc',
  'srclang': 'srcLang',
  'srcset': 'srcSet',
  'tabindex': 'tabIndex',
  'usemap': 'useMap',
  'viewbox': 'viewBox',
  'preserveaspectratio': 'preserveAspectRatio'
}
var ELEMENT_ATTRIBUTE_MAPPING = {input: {checked: 'defaultChecked',value: 'defaultValue'}}
function domAttrToJSX(tag,attrNameCase,attrValue){
  var attrName = attrNameCase.toLowerCase()
  var astAttrName = (ELEMENT_ATTRIBUTE_MAPPING[tag] && ELEMENT_ATTRIBUTE_MAPPING[tag][attrName])
                    || ATTRIBUTE_MAPPING[attrName] || attrName
  if (astAttrName === 'style'){
    var astAttrValue = domStyleToJSX(attrValue)
  }else if(isNumeric(attrValue)){
    var astAttrValue = t.jSXExpressionContainer(
                         t.numericLiteral(parseInt(attrValue, 10)))
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
      error("Transfo "+transfo.selector+" does not match anything in "+jsxZ.htmlPath,transfo.selNode)
      return []
    }
    matchingNodes.map(function(subdom,i){
      var cloned_transfo = deepcopy(transfo)
      cloned_transfo.attrs = cloned_transfo.attrs.map(t.cloneDeep)
      map[subdom.tagIndex] = {i: i,transfo: cloned_transfo}
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
  transfo.attrs.filter(function(attr){
    return !(attr.value.type == "JSXExpressionContainer" && attr.value.expression.type == "Identifier" && attr.value.expression.name == "undefined")
  }).map(function(attr){
    path.pushContainer("attributes",attr)
  })
  path.traverse({
    Identifier(path){
      if(swapMap[path.node.name])
        path.replaceWith(swapMap[path.node.name])
    }
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
    var childrenz = path.node.children.map(t.cloneDeep)

    path.get('children').map(function(childz){ childz.remove() })
    transfo.node.children.map(function(zchild){ path.pushContainer('children', t.cloneDeep(zchild)) })

    var do_transform_path = function(elemPath){
      if(elemPath.node.openingElement.name.name == "ChildrenZ"){
        var children = childrenz.map(t.cloneDeep)
        if(elemPath.parentPath.node.type ==='JSXElement'){
          var prev_children = elemPath.parentPath.node.children.map(t.cloneDeep)
          elemPath.parentPath.get('children').map(function(child){ child.remove() })
          prev_children.map(function(prev_child){
            if(prev_child.type =='JSXElement' && prev_child.openingElement.name.name == "ChildrenZ"){
              children.map(function(new_child){
                elemPath.parentPath.pushContainer('children',new_child)
              })
            }else{
              elemPath.parentPath.pushContainer('children',prev_child)
            }
          })
          elemPath.parentPath.traverse({
            Identifier: function(path) {
              if(swapMap[path.node.name])
                path.replaceWith(swapMap[path.node.name])
            },
            JSXElement: do_transform_path
          })
        }else{
          var children_without_text = children.map(function(child){
            return (child.type == "JSXText") ?  t.stringLiteral(child.value) : child
          })
          elemPath.replaceWith(t.arrayExpression(children_without_text))
        }
      }
    }
    do_transform_path(path)
    path.traverse({
      Identifier: function(path) {
        if(swapMap[path.node.name])
          path.replaceWith(swapMap[path.node.name])
      },
      JSXElement: do_transform_path
    })
  }
}

function domAstZTransfo(jsxzPath,jsxZ,dom){
  var transfosByTagIndex = searchTransfosByTagIndex(jsxZ,dom)
  var do_transform_path = function(subpath){
    if (transfoIndexed=transfosByTagIndex[subpath.node.tagIndex]){
      var transfo = transfoIndexed.transfo,
          swapMap = genSwapMap(subpath.node.openingElement.attributes,transfoIndexed.i)
      alterAttributes(subpath.get("openingElement"),transfo,swapMap)
      alterTag(subpath,transfo,swapMap)
      alterChildren(subpath,transfo,swapMap)
    }
  }
  do_transform_path(jsxzPath)
  jsxzPath.traverse({JSXElement: { exit: do_transform_path }})
}

module.exports.default = function() {
  return {
    inherits: require("babel-plugin-syntax-jsx"),
    pre(state) { this.currentTagIndex = 0 },
    visitor: {
      Program(path,state){
        // On program start, do an explicit traversal up front for your plugin.
        var options = state.opts
        var self = this
        path.traverse({
          JSXElement: {exit(path){
            if(path.node.openingElement.name.name === "JSXZ"){
              var jsxzPath = path, jsxZ = parseJSXsSpec(path,options || {})
              parseDom(jsxZ,function(dom){
                var domAst = domToAst(dom,self.currentTagIndex)
                self.currentTagIndex = domAst.tagIndex
                jsxzPath.replaceWith(domAst)
                domAstZTransfo(jsxzPath,jsxZ,dom)
              })
            }
          }}
        })
      }
    }
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

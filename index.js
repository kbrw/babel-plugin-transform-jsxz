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

function isJSXAttribute(name) {
  if (name === undefined) {
    return function(attr) { return attr.type === 'JSXAttribute' }
  } else {
    return function(attr) { return (attr.type === 'JSXAttribute' && attr.name.name === name) }
  }
}

function isJSXSpreadAttribute(attr) {
  return attr.type === 'JSXSpreadAttribute'
}

/**
 * Check if a JSX node is empty (only whitespace)
 */
function isNodeEmpty(node) {
  return !node.children.some(function(child) {
    return child.type !== 'JSXText' || child.value.trim() !== ''
  })
}

function isZReservedAttr(name) {
  const reserved = ["tag","sel","if","replace"]
  return reserved.includes(name)
}

function isJSXZReservedAttr(name) {
  const reserved = ["tag","sel","in"]
  return reserved.includes(name)
}

function parseJSXsSpec(path,options,callback){
  var ast = path.node
  var opentag = ast.openingElement
  var htmlPathAttr = opentag.attributes.filter(isJSXAttribute("in"))[0]
  if(!htmlPathAttr)
    error("jsxZ attribute 'in' necessary",ast.openingElement,path)
  if(htmlPathAttr.value.type !== 'StringLiteral')
    error("jsxZ 'in' must be an hardcoded string",htmlPathAttr.value,path)
  var htmlPath = htmlPathAttr.value.value

  var selectorAttr = opentag.attributes.filter(isJSXAttribute("sel"))[0]
  if(selectorAttr && selectorAttr.value.type !== 'StringLiteral')
    error("jsxZ 'sel' must be an hardcoded CSS selector",selectorAttr.value,path)
  var rootSelector = selectorAttr && selectorAttr.value.value

  transfos = ast.children
    .filter(function(c){return c.type==='JSXElement'})
    .map(function(c){
      if(c.openingElement.name.name !== "Z")
        return null
      var selectorAttr = c.openingElement.attributes.filter(isJSXAttribute("sel"))[0]
      if(!selectorAttr || selectorAttr.value.type !== 'StringLiteral')
        error("Z 'sel' attribute is mandatory and must be a hardcoded CSS selector",selectorAttr && selectorAttr.value || c.openingElement,path)

      var tagAttr = c.openingElement.attributes.filter(isJSXAttribute("tag"))[0]
      var tag = tagAttr && tagAttr.value.value

      var replaceAttr = c.openingElement.attributes.filter(isJSXAttribute("replace"))[0]
      var replace = replaceAttr && replaceAttr.value.value === "true"

      var ifAttr = c.openingElement.attributes.filter(isJSXAttribute("if"))[0]
      var ifExpr = ifAttr && ifAttr.value.expression

      var otherAttrs = c.openingElement.attributes
        .filter(function(attr){ return !isZReservedAttr(attr.name.name) })
      return {selector: selectorAttr.value.value, tag: tag, attrs: otherAttrs, node: c,selNode: selectorAttr.value, replace: replace, ifExpr: ifExpr}
    })
    .filter(function(c){return c !== null})

  var tagAttr = ast.openingElement.attributes.filter(isJSXAttribute("tag"))[0]
  var tag = tagAttr && tagAttr.value.value
  var otherAttrs = ast.openingElement.attributes
    .filter(function(attr){ return !isJSXZReservedAttr(attr.name.name) })

  var rootTransfoNode = null
  if (transfos.length === 0 && !isNodeEmpty(path.node)){
    rootTransfoNode = path.node
  }

  const rootTransfo = {
    tag: tag,
    attrs: otherAttrs,
    node: rootTransfoNode
  }

  transfos.push(rootTransfo)

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
  'preserveaspectratio': 'preserveAspectRatio',
  'clip-rule': 'clipRule',
  'fill-rule': 'fillRule',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-opacity': 'strokeOpacity',
  'stroke-width': 'strokeWidth',
  'text-anchor': 'textAnchor',
  'text-decoration': 'textDecoration',
  'text-rendering': 'textRendering',
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

/**
 *
 * @param {*} jsxZ the jsxZ spec build with the parseJSXsSpec function
 * @param {*} rootdom the root dom of the html file
 * @returns a mapping between the tagIndex of dom nodes and the transfos to apply
 */
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
    // Only ignore {...props} for now, if React add something more it'll crash at that time
    if (isJSXSpreadAttribute(attr)) { return }
    map[nameFun(attr.name.name)] = valueFun(attr.value)
  })
  return map
}

function removeOverwrittenAttrs(attrsPath,newAttrs){
  var newAttrsSet = attributesMap(newAttrs,function(name){return name},function(_){return true})
  attrsPath.forEach(function(attr) {
    if (isJSXSpreadAttribute(attr)) { return }
    if (newAttrsSet[attr.node.name.name]) { attr.remove() }
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
    if (isJSXAttribute()(attr)) {
      // We don't want to keep attributes that have the the expression `undefined` inside.
      // Why does it matter though ?
      if (attr.value.type == "JSXExpressionContainer" && attr.value.expression.type == "Identifier" && attr.value.expression.name == "undefined") {
        return false
      }
    }
    // We want to keep the spread attributes though. And other stuffs eventually.
    return true
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

/**
 * Handle ChildrenZ
 * @param {*} path a path in the source HTML AST, selected by a Z or JSXZ element
 * @param {*} transfo the transfo to apply. transfo.node if the Z element AST node. transfo.node is undefined for the JSXZ element itself
 * @param {*} swapMap
 */
function alterChildren(path,transfo,swapMap){
  if(transfo.node){ // no children alteration if no "node" transfo attribute, this is the case for the transfo of the JSXZ element itself
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

function applyIfExpr(path, transfo) {
  if (transfo.ifExpr) {
    const ifExpr = t.cloneDeep(transfo.ifExpr)
    ifExpr.consequent = path.node

    // This build into `{ifExpr ? path.node : null}`
    const expr = t.jSXExpressionContainer(
      t.conditionalExpression(ifExpr, path.node, t.nullLiteral())
    )

    path.replaceWith(expr)
  }
}

function applyReplace(path, transfo) {
  if (transfo.replace) {
    path.replaceInline(path.node.children)
  }
}

/**
 * @param {*} jsxzPath the HTML selected by a JSXZ element, as a JSXElement Babel path.
 * @param {*} jsxZ the jsxZ parsed spec, as returned by the parseJSXsSpec function. Contains the transformations to apply.
 * @param {*} dom the dom parsed spec, as returned by the htmlparser2 parseDOM function.
 */
function domAstZTransfo(jsxzPath,jsxZ,dom){
  var transfosByTagIndex = searchTransfosByTagIndex(jsxZ,dom)

  var do_transform_path = function(subpath){
    if (transfoIndexed=transfosByTagIndex[subpath.node.tagIndex]){
      // Deleting the tagIndex property to avoid applying the same transformation twice,
      // in case the subpath is moved deeper in the AST (this happen with the if feature
      // which add a conditional expression around the subpath)
      delete subpath.node.tagIndex

      var transfo = transfoIndexed.transfo
      var swapMap = genSwapMap(subpath.node.openingElement.attributes,transfoIndexed.i)
      alterAttributes(subpath.get("openingElement"),transfo,swapMap)
      alterTag(subpath,transfo,swapMap)
      alterChildren(subpath,transfo,swapMap)
      applyIfExpr(subpath,transfo)
      applyReplace(subpath,transfo)
    }
  }

  // First, apply the Z transformations on the JSXZ element itself.
  do_transform_path(jsxzPath)

  // Then, apply the Z transformations on the children of the JSXZ element.
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

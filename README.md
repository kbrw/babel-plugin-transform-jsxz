enlived-jsx
===========

**NOT Production Ready Yet !!**

TODO : jstransform visitor specification

Function to generate JSX components from HTML files and CSS
selectors with an " enlive like" semantic.

Add it to your compilation process to generate JSX files containing 
your *basic* html React component.

```javascript
var JSX = require('enlived-jsx')
JSX('index.html','ul.class1',{
  'span.label1': 'this.props.prop1',
  '.label2': 'this.props.prop2,
  'span.label1': {
    class: old=>`"${old}"+ (this.props.active ? " active":"")`,
    onClick: 'this.props.handleClick'
  }
})
```

## Usage

TODO : API documentation 

## Example integration : Webpack

Typical integration is to generate JSX file in your compilation
process, let's see an example with webpack :

```javascript
var JSX = require('enlived-jsx')

var file_path = 'components/html.jsx'
function file_content(){ return `
module.exports = {
  showCart: ${JSX('index.html','.show-cart-button', {
    '.show-cart-button-quantity': 'this.props.quantity'
  })},
  index: ${JSX('index.html','body', {
    '.content': 'this.props.children'
  })}
}
`}

module.exports = function(config){}
module.exports.prototype.apply = function(compiler) {
  compiler.plugin('compilation',function(compiler){
    require('fs').writeFileSync(file_path,file_content())
  })
}
```

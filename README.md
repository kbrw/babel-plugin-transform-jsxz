JSXZ
====

**NOT Production Ready Yet !!**
**NOT Ready to use At All Yet !!**

Write your JSX using DOM transformations from a static HTML file at
compilation time - in the same way that
[enlive](https://github.com/cgrand/enlive) templates work : targeting 
runtime evaluations with CSS selectors.

In your source file you can use a JSX containing special "fake"
components : `jsxZ` `Z`

```javascript
<jsxZ file="mytemplate.html" sel=".cart">
  <Z sel=".bu" className="button"/>
  <Z sel=".price">{this.props.price}</Z>
  <Z swap="Link" sel="a" to="cart" params={{user: this.props.userid}}>{old}</Z>
</jsxZ>
```

Then to compile it into JSX file, add in your compilation chain :

```javascript
var newjsx = require('jsxz')(oldjsx)
```

## Usage

TODO : Documentation

## Integrated Webpack Loader

Typical integration is to generate JSX file in your compilation
process, let's see an example with webpack :

```javascript
TODO
```

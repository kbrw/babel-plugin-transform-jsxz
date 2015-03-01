JSXZ
====

Precompile your JSX HTML components from static HTML templates using CSS
selectors transformations (in the same way that [enlive](https://github.com/cgrand/enlive) templates work).

Example usage :

```javascript
module.exports = {
  menuItem: <jsxZ file="index" sel="ul.menu li">
    <Z sel="price">{this.props.price}</Z>
    <Z sel="a" tag="Link">
  </jsxZ>,
  showCart: <jsxZ file="index" sel=".cart button">
    <Z sel="price">{this.props.price}</Z>,
    <Z sel="a" tag="Link" to="cart"><ChildrenZ/></Z>
  </jsxZ>
}

var other = function(){
  return (
    <jsxZ file="test.html" sel="body">
      <Z sel=".l2" className={classNameZ + ' aaa'}>{{toto: 4}}</Z>
      <Z tag="Link" sel=".l11" to="merde">
        {"coucou "+2}
        <div>
          <ChildrenZ/>
          <div className="toto1"><ChildrenZ/></div>
          <div className="toto2" parentClass={{classNameZ}}></div>
          <div className="toto3"></div>
          <ChildrenZ/>
          <div className="toto4"></div>
        </div>
        <ChildrenZ/>
      </Z>
    </jsxZ>
  )
}
<jsxZ file="mytemplate.html" sel=".cart">
  <Z sel=".bu" className="button"/>
  <Z sel=".price">{this.props.price}</Z>
  <Z tag="Link" sel="a" to="cart" params={{user: this.props.userid}}><Origin/></Link>
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

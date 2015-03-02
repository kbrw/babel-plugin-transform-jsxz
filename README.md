JSXZ
====

Precompile your JSX HTML components from static HTML templates using CSS
selectors transformations (in the same way that [enlive](https://github.com/cgrand/enlive) templates work).

Example usage :

```javascript
var cn = require('classnames)
module.exports = {

  showCartButton: React.createClass({
    render: function() {
      <JSXZ in="index" sel=".cart button">
        <Z sel="price">{this.props.price} €</Z>,
        <Z sel="a" tag="Link" to="cart"><ChildrenZ/></Z>
      </JSXZ>
    }
  }

  menuItem: React.createClass({
    render: function() {
      return <JSXZ in="index" sel="nav li"
               className={cn(classNameZ,{
                 'active': this.props.active,
                 'mainmenu': this.props.mainmenu
                })}/>
    }
  })
}

```

Then to compile it into JSX file, add in your compilation chain :

```javascript
// options is an optional parameter : see options.js for possible values and default
var newjsx = require('jsxz')(source,options,function(err,result,dependencies){
  if(err) handleError(err) //Error during source transformation
  result.code //JSX transformed code
  result.map //source map as json object
  dependencies //array of html file fullpath dependencies
  // Error thrown
})
```

Use for instance [the webpack jsxz loader](https://github.com/awetzel/jsxz-loader).
Or build your own usage with you compilation tool.

## Usage

The `<JSXZ>` fake react component API is the following : 

- `in` attribute is mandatory, it is the original HTML file (".html" extension is optional),
  you can use full or relative path. Relative path can be relative to the `templatesDir` option if given.
- `sel` attribute is optional, default select the entire document.
  This attribute is a CSS selector to choose the input HTML block to
  convert to a JSX component. Only the first matching element will be
  selected.
- All other attributes are added to the output component, if the
  attribute already exists it will be overwritten (except if the
  attribute content is `{undefined}` the it will be deleted). 
- special *variables* named `attributeNameZ` will be available 
  in attribute expressions. For instance you can add a class with :
  `className={classNameZ+" newclass"}`
- `<JSXZ>` children must be **only** `<Z>` components.

These `Z` components describe how to merge your JS/JSX code into your
  HTML converted component :

- `sel` attribute is mandatory, it is a CSS selector to select 
  the Components to modify. A warning will be emmited if 
- `tag` attribute is optional, it can be used to change the component
  name.
- all other attributes are added to the output component using the same
  rules described above.
- `<Z>` children can be any valid JSX, they will replace
  the children of the selected HTML component
- special *variables* named `attributeNameZ` will be available in
  attribute and children expressions. For instance you can add a
  class with : `className={classNameZ+" newclass"}`
- a special *variable* named `indexZ` will contain the current index
  of the replaced element (because the CSS selector can match several
  elements).
- a special component `<ChildrenZ/>` will be accepted in `<Z>` children and
  will be replaced with the original children.

Example usage :
Construct Menu Links, replace all `<a>` with a component `<Link>`
targetting a page according to the matching index :

```javascript
var  Menu = React.createClass({
  render: function() {
    var menu = ["home","contact","about"]
    return <JSXZ in="index" sel="nav">
      <Z "nav a" tag="Link" to={menu[indexZ]}><ChildrenZ/></Z>
    </JSXZ>
  }
})
```

## Configuration

See `options.js` to see the allowed configuration as second option of `require('jsxz')`

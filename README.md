# Babel JSXZ transform

This is a [Babel](https://babeljs.io/) plugin that allows you to create React components from HTML files.

You can apply transformations to your HTML files to create dynamic React components. Those transformations are based on CSS selectors (in the same way that [enlive](https://github.com/cgrand/enlive) templates work).

## Usage example

```jsx
import { cn } from 'classnames'

export function CartButton(props) {
  const { price } = props;

  return <JSXZ in="index" sel=".cart button">
    <Z sel=".price">{price} €</Z>,
    <Z sel="a" tag="Link" to="cart"><ChildrenZ/></Z>
  </JSXZ>
}
```

In this example, the `CartButton` component is created by selecting the `.cart button` element in the `index.html` file.

On this element, two Z transformations are applied:
- the `.price` element is replaced by the `price` prop,
- the `a` element's tag is replaced by `Link`.

With the provided `index.html` file:
```html
<div class="cart">
  <div class="button">
    <span class="price">15 €</span>
    <a>Go to cart</a>
  </div>
</div>
```

The JSXZ plugin will generate the following code:
```jsx
export function CartButton(props) {
  const { price } = props;

  return <div className="button">
    <span className="price">{price} €</span>
    <Link to="cart">Go to cart</Link>
  </div>;
}
```

## Setup

You can use this transform inside your JS babel plugin, along with the "jsx" Babel transform:

```javascript
{
  plugins: [
    ["transform-jsxz", {templatesDir: "/path/to/your/html/template/dir"}],
    "transform-react-jsx"
  ]
}
```

Or use a dedicated loader [the webpack jsxz loader](https://github.com/awetzel/jsxz-loader).
Or build your own usage with you compilation tool.

## Usage

### The JSXZ element

To start using JSXZ, you need to add a `<JSXZ>` element in your JSX code. This JSXZ element will be replaced by the the HTML code selected and transformed with the `<Z>` elements.

**Attributes**
- `in` attribute is mandatory, it is the original HTML file (".html" extension is optional), you can use full or relative path. Relative path can be relative to the `templatesDir` option if given. See [Configuration](#configuration) for more details.
- `sel` attribute is optional, default select the entire document.
  This attribute is a CSS selector to choose the input HTML block to
  convert to a JSX component. Only the first matching element will be
  selected.
- All other attributes are added to the output component, if the attribute already exists it will be overwritten (except if the attribute content is `{undefined}` then it will be deleted). 
- special *variables* named `attributeNameZ` will be available in attribute expressions. For instance you can add a class with: `className={classNameZ + " newclass"}`

**Children**
The children of a JSXZ element can be either JSX elements or `<Z>` elements, but you cannot mix both.

If you use JSX elements, they will replace the content of the selected HTML element.

Example of direct JSX children:
```jsx
<JSXZ in="index" sel=".cart button">
  <span className="price">{price} €</span>
</JSXZ>
```

If you use `<Z>` elements, each `<Z>` element will represent a transformation that will be applied to your HTML. See the next section for more details.

**Special variables**
You can access the attributes from the original HTML with the special variables `attributeNameZ` (where `attributeName` is the name of the attribute). For instance, if you have an attribute `toto` in your HTML, you can access it with the variable `totoZ`.

For example, you can add new CSS classes to an element like this:
```jsx
<JSXZ in="index" sel=".cart button" className={classNameZ + " newclass"}>
```

Those special variables are available in JSXZ and Z attibute expressions.

### The Z element

Each `<Z>` element represents a transformation that will be applied to your HTML. You can select the elements you want to transform in the original HTML using the `sel` attribute.

**Attributes**

- `sel` attribute is mandatory, it is a CSS selector to select the elements to modify
- `tag` attribute is optional, it can be used to change the element name
- all other attributes are added to the output element using the same rules described above
- `<Z>` children can be any valid JSX, they will replace the children of the selected HTML element
- special *variables* named `attributeNameZ` will be available, see above
- a special *variable* named `indexZ` will contain the current index of the replaced element (because the CSS selector can match several elements).
- `if` attribute is optional, it can be used to conditionnaly render a `<Z>` element. A ternary expression is generated with the `if` attribute as the condition, the `<Z>` element as the true value and null as the false value. For instance, `<Z if={condition} sel=".cart button">` will be transformed to `{condition ? <Z sel=".cart button"> : ""}`.
- `replace` attribute is optional, it can be used to ask JSXZ to replace the selected element with the children of the `<Z>` element.

**Children**

The children of a `<Z>` element will replace the children of the selected HTML element. You can use the `<ChildrenZ />` component to insert the original children.

Example usage:
Construct Menu Links, replace all `<a>` with a component `<Link>`
targetting a page according to the matching index :

```jsx
function MenuLink() {
  const menu = ["home","contact","about"]

  return <JSXZ in="index" sel="nav">
    <Z "nav a" tag="Link" to={menu[indexZ]}><ChildrenZ/></Z>
  </JSXZ>
}
```

## Configuration

Then `templatesDir` plugin configuration allows you to use a different relative
path for HTML files than the current directory.

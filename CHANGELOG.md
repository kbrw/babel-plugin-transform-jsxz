# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] 2023-06-12

This update is retrocompatible with previous versions: you can upgrade your version of `babel-plugin-transform-jsxz` without changing your code.

New features are available to make JSXZ easier to use:
- `replace` feature to replace a Z element with its children,
- `if` feature to render a Z element only if the provided conditional is true,
- you can now put JSX elements directly in a JSXZ element.

### Added

- New `replace` feature to replace a Z element with its children.

  - Using the `replace="true"` attribute on a Z element, will replace it with its children. You now don't need to add HTML div wrapper elements around the elements you select with Z.
  - Example:

    ```jsx
    function OrdersTable() {
      return (
        <JSXZ in="orders" sel=".orders-table">
          <Z sel=".rows">// ...</Z>
        </JSXZ>
      );
    }

    function OrdersPage() {
      return (
        <JSXZ in="orders" sel=".orders-page">
          <Z sel=".orders-table" replace="true">
            <OrdersTable />
          </Z>
        </JSXZ>
      );
    }
    ```

    Without the replace feature, you need to add a `.table-wrapper` div around the `.orders-table` element to avoid having two `.orders-table` elements in the DOM.

- New `if` feature to render a Z element only if the provided conditional is true.

  - Example:

    ```jsx
    function OrdersPage() {
      const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);

      return (
        <JSXZ in="orders" sel=".orders-page">
          // ...
          <Z sel=".orders-edit-modal" if={isEditModalOpen} replace="true">
            <OrdersEditModal />
          </Z>
        </JSXZ>
      );
    }
    ```

- You can now put JSX elements directly in a JSXZ element.
  - Example:
    ```jsx
    function EditOrderForm() {
      return (
        <JSXZ in="user-edit-page" sel=".edit-form">
          <TextField label="username" ...>
          <TextField label="email" ...>
          <Button>Submit</Button>
        </JSXZ>
      );
    }
    ```

## [1.1.2] 2023-03-10

### Fixed

- Map SVG html attributes to JSX attributes.

## [1.1.1] 2022-06-29

### Fixed

- More cases of props spread are handled.

## [1.1.0] - 2022-06-23

### Added

- Handling props spread with JSXZ and Z.

## [1.0.5] - 2019-05-02

---

Changelog format inspired by [keep-a-changelog]

[keep-a-changelog]: https://github.com/olivierlacan/keep-a-changelog
[unreleased]: https://github.com/kbrw/babel-plugin-transform-jsxz/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/kbrw/babel-plugin-transform-jsxz/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/kbrw/babel-plugin-transform-jsxz/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/kbrw/babel-plugin-transform-jsxz/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/kbrw/babel-plugin-transform-jsxz/compare/v1.0.5...v1.1.0
[1.0.5]: https://github.com/kbrw/babel-plugin-transform-jsxz/compare/v0.0.0...v1.0.5

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

function loadSource(file, dependencies = {}, privateExports = []) {
  const filename = path.resolve(__dirname, '..', file);
  const source = fs.readFileSync(filename, 'utf8') +
    (privateExports.length ? `\nexport const __test = { ${privateExports.join(', ')} };` : '');
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  const requireDependency = (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name === 'react/jsx-runtime') return require(name);
    throw new Error(`Missing test dependency: ${name} in ${file}`);
  };
  new Function('require', 'module', 'exports', outputText)(requireDependency, module, module.exports);
  return module.exports;
}

function hooks(initialStates = [], initialRefs = []) {
  const states = [...initialStates];
  const refs = [...initialRefs];
  let stateIndex = 0;
  let refIndex = 0;
  return {
    react: {
      ...React,
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
      },
      useRef(initial) {
        const index = refIndex++;
        return refs[index] ?? (refs[index] = { current: initial });
      },
      useEffect() {},
    },
    render(component, props) {
      stateIndex = 0;
      refIndex = 0;
      return component(props);
    },
  };
}

function findElement(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (predicate(tree)) return tree;
  const children = tree.props?.children ?? tree;
  for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
    if (child === tree) continue;
    const found = findElement(child, predicate);
    if (found) return found;
  }
}

function component(name) {
  return new Proxy(function TestComponent() {}, {
    get(_, key) { return key === 'displayName' ? name : component(`${name}.${String(key)}`); },
  });
}

const ui = new Proxy({ useThemeColor: () => '#000', useToast: () => ({ toast: { show() {} } }) }, {
  get(target, key) { return key in target ? target[key] : component(String(key)); },
});
const native = {
  View: 'View', Text: 'Text', Pressable: 'Pressable', FlatList: 'FlatList',
  ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView',
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
  useColorScheme: () => 'light',
};
const theme = { Spacing: { half: 2, one: 4, two: 8, three: 12, four: 16, five: 20 }, MaxContentWidth: 600 };

module.exports = { loadSource, hooks, findElement, ui, native, theme };

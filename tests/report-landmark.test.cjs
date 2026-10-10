const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

test('report landmark has a muted label above its value, both hidden when absent', () => {
  const source = ts.createSourceFile('report.tsx', fs.readFileSync('src/app/report/[id].tsx', 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let landmarkBlock;
  function visit(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        node.left.getText(source) === 'report.landmark') landmarkBlock = node.right;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(landmarkBlock);
  const texts = [];
  function collect(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'ThemedText') texts.push(node);
    ts.forEachChild(node, collect);
  }
  collect(landmarkBlock);
  assert.equal(texts.length, 2);
  assert.equal(texts[0].children.map((node) => node.getText(source)).join('').trim(), 'Landmark');
  const attrs = texts[0].openingElement.attributes.getText(source);
  assert.match(attrs, /type="small"/);
  assert.match(attrs, /themeColor="textSecondary"/);
  assert.match(texts[1].getText(source), /\{report\.landmark\}/);
});

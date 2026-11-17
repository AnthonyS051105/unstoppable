import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SosNoResponderToggle } from "../src/screens/sos";

test("SosNoResponderToggle pairs checkbox with explicit label id and aria-labelledby", () => {
  const html = renderToStaticMarkup(
    createElement(SosNoResponderToggle, { checked: false, onChange: () => {} }),
  );

  const inputIdMatch = html.match(/<input[^>]*\sid="([^"]+)"/);
  const labelForMatch = html.match(/<label[^>]*\sfor="([^"]+)"/);
  const labelledByMatch = html.match(/<input[^>]*\saria-labelledby="([^"]+)"/);
  assert.ok(inputIdMatch?.[1], "checkbox must have an id");
  assert.equal(labelForMatch?.[1], inputIdMatch[1], "label for must match checkbox id");
  assert.ok(labelledByMatch?.[1], "checkbox must reference aria-labelledby");
  assert.match(
    html,
    new RegExp(`<span[^>]*\\sid="${labelledByMatch[1]}"[^>]*>Simulasikan tidak ada penerima<\\/span>`),
  );
});

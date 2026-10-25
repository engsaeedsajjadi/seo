import assert from 'node:assert/strict';
import {exportReport} from '../../apps/api/src/lib/report-export.ts';
const snapshot={project:{name:'<script>alert(1)</script>'},findings:[{title:'=HYPERLINK("https://untrusted.test")',severity:'high'}]};
assert.deepEqual(JSON.parse(exportReport(snapshot,'json').body),snapshot);
const html=exportReport(snapshot,'html').body;
assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
const csv=exportReport(snapshot,'csv').body;
assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('findings.0.title'));
console.log('PASS: report exports preserve JSON, escape HTML and neutralize spreadsheet formulas');

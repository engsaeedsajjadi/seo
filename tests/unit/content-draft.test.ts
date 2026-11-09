/** Article drafts: the prompt, the cleaning of AI output, and the Markdown → HTML conversion for WordPress. */
import assert from 'assert';
import { buildDraftPrompt, cleanDraft } from '../../apps/worker/src/ai.js';
import { markdownToHtml } from '../../apps/api/src/lib/markdown.js';

console.log('Testing article drafts...');
const prompt = buildDraftPrompt({ title: 'بازسازی آشپزخانه', targetKeyword: 'بازسازی آشپزخانه', targetWordCount: 50000, language: 'fa',
  outline: { sections: [{ heading: 'مقدمه', subheadings: ['چرا'], keyPoints: ['هزینه'] }], faqQuestions: ['چقدر طول می‌کشد؟'] } });
assert.ok(prompt.includes('Language: fa') && prompt.includes('- مقدمه') && prompt.includes('* cover: هزینه') && prompt.includes('چقدر طول می‌کشد؟'));
assert.ok(prompt.includes('about 4000 words'), 'length is capped');
assert.ok(/Do not invent statistics/.test(prompt));

const cleaned = cleanDraft('```markdown\n# عنوان\n\n## بخش\nمتن <img src=x onerror=alert(1)> ساده\n\n\n\n- مورد\n```');
assert.strictEqual(cleaned.markdown, '## بخش\nمتن  ساده\n\n- مورد');
assert.ok(cleaned.words >= 4);
console.log('✅ prompt and cleaning');

const html = markdownToHtml('## تیتر **مهم**\nخط یک\nخط دو\n\n- الف\n- ب\n1. یک\n2. دو\n\n### زیر <script>x</script> & "q"\n#### کوچک\n##### بیش‌ازحد');
assert.strictEqual(html, [
  '<h2>تیتر <strong>مهم</strong></h2>',
  '<p>خط یک خط دو</p>',
  '<ul><li>الف</li><li>ب</li></ul>',
  '<ol><li>یک</li><li>دو</li></ol>',
  '<h3>زیر &lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot;</h3>',
  '<h4>کوچک</h4>',
  '<p>##### بیش‌ازحد</p>',
].join('\n'));
console.log('✅ Markdown to HTML escapes everything and keeps the structure');
console.log('\n✅ ALL article draft tests passed');

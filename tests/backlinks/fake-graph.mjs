// Serves two synthetic Common Crawl domain-graph releases in the published layout.
// The project domain is passed as argv[2]; its competitor is rival-<tag>.rankforge.test (argv[3]).
import http from 'node:http';
import { gzipSync } from 'node:zlib';
const [project, rival] = [process.argv[2], process.argv[3]];
const rev = (d) => d.split('.').reverse().join('.');
const vertices = [`0\tcom.blog-example`, `1\t${rev(project)}`, `2\t${rev(rival)}`, `3\tir.news-example`, `4\torg.wiki-example`].join('\n');
const releases = {
  'cc-main-test-a': ['0\t1', '4\t1', '0\t2', '3\t2', '4\t2'].join('\n'), // blog, wiki → project; blog, news, wiki → rival
  'cc-main-test-b': ['4\t1', '3\t2'].join('\n'),                       // blog no longer links to the project
};
http.createServer((req, res) => {
  const m = /^\/hg\/(cc-main-test-[ab])\/domain\/\1-domain-(vertices|edges)\.txt\.gz$/.exec(req.url);
  if (!m) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'application/gzip' });
  res.end(gzipSync(m[2] === 'vertices' ? vertices : releases[m[1]]));
}).listen(5997, '127.0.0.1');

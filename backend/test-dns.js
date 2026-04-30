const dns = require('dns');

console.log('Default servers:', dns.getServers());

dns.resolveSrv('_mongodb._tcp.cluster0.4m7ooql.mongodb.net', (err, res) => {
  console.log('Default SRV result:', err ? err.message : JSON.stringify(res));
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  console.log('Custom servers:', dns.getServers());
  dns.resolveSrv('_mongodb._tcp.cluster0.4m7ooql.mongodb.net', (err2, res2) => {
    console.log('Custom SRV result:', err2 ? err2.message : JSON.stringify(res2));
  });
});

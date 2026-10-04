module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: 'ilham-novandi-api',
    version: '8.5.1',
    runtime: 'vercel-node',
    timestamp: new Date().toISOString()
  });
};

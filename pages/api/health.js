export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }
  res.status(200).json({
    status: 'ok',
    project: 'omh-tracker',
    timestamp: new Date().toISOString(),
  })
}

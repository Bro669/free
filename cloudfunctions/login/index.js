const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 返回 openid，并顺手确保数据库集合存在（幂等，省去手动建集合的部署步骤）。
// 注意：集合的安全规则仍需在云开发控制台配置（见 README）。
let collectionsEnsured = false
async function ensureCollections() {
  if (collectionsEnsured) return
  const db = cloud.database()
  for (const name of ['routes', 'rides']) {
    try {
      await db.createCollection(name)
    } catch (e) {
      // 已存在（-501001 等）属正常
    }
  }
  collectionsEnsured = true
}

exports.main = async () => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext()
  try { await ensureCollections() } catch (e) { console.warn('ensureCollections', e) }
  return { openid: OPENID, appid: APPID, unionid: UNIONID }
}

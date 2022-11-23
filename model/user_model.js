require('dotenv').config()
const axios = require('axios')
const db = require('../utils/mysqlconf')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const salt = parseInt(process.env.BCRYPT_SALT)
const { TOKEN_EXPIRE, TOKEN_SECRET } = process.env // 30 days by seconds

// (birthday, height, weight, gender, diet_type, diet_goal, activity_level, goal_calories, goal_carbs, goal_protein, goal_fat, TDEE) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

const setUserTarget = async (userId, userInfo) => {
  const [result] = await db.execute('INSERT INTO `user_bodyInfo` (user_id, birthday, height, weight, gender, diet_goal, activity_level, goal_calories, goal_carbs, goal_protein, goal_fat, TDEE) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, userInfo.birthday, userInfo.height, userInfo.weight, userInfo.gender, userInfo.diet_goal, userInfo.activity_level, userInfo.goal_calories, userInfo.goal_carbs, userInfo.goal_protein, userInfo.goal_fat, userInfo.TDEE])
  return result
}

const getUserDetail = async (email) => {
  const [userDetail] = await db.execute('SELECT user.id,user.name, user.email,user.picture, user_bodyInfo.birthday, user_bodyInfo.height, user_bodyInfo.weight, user_bodyInfo.gender, user_bodyInfo.diet_goal, user_bodyInfo.activity_level, user_bodyInfo.goal_calories, user_bodyInfo.goal_carbs, user_bodyInfo.goal_protein, user_bodyInfo.goal_fat, user_bodyInfo.TDEE FROM `user` LEFT JOIN `user_bodyInfo` ON user.id = user_bodyInfo.user_id  WHERE email = ?', [email])
  return userDetail
}

/* PATCH account相關資訊 */
const updateUserProfile = async (updateData, userId) => {
  console.log('updateData', updateData)
  if (Object.keys(updateData).length === 0) return
  let sql = 'UPDATE user SET'
  Object.entries(updateData).forEach(([key, value]) => {
    const valueToSet = typeof updateData[key] === 'string' ? `'${value}'` : value
    sql += ` ${key}=${valueToSet},`
  })
  sql = sql.slice(0, -1) // Remove last ","
  sql += ` WHERE id = ${userId};`
  const [result] = await db.execute(sql)
  return result
}

/* PATCH TDEE相關參數 */
const updateUserBodyInfo = async (updateData, userId) => {
  console.log('updateData', updateData)
  if (Object.keys(updateData).length === 0) return
  let sql = 'UPDATE user_bodyInfo SET'
  Object.entries(updateData).forEach(([key, value]) => {
    const valueToSet = typeof updateData[key] === 'string' ? `'${value}'` : value
    sql += ` ${key}=${valueToSet},`
  })
  sql = sql.slice(0, -1) // Remove last ","
  sql += ` WHERE user_id = ${userId};`
  const [result] = await db.execute(sql)
  return result
}

/* PATCH 目標營養素比例or目標熱量 */
const updateNutritionTarget = async (updateData, userId) => {
  console.log('updateData', updateData)
  if (Object.keys(updateData).length === 0) return
  let sql = 'UPDATE user_bodyInfo SET'
  Object.entries(updateData).forEach(([key, value]) => {
    const valueToSet = typeof updateData[key] === 'string' ? `'${value}'` : value
    sql += ` ${key}=${valueToSet},`
  })
  sql = sql.slice(0, -1) // Remove last ","
  sql += ` WHERE user_id = ${userId};`
  const [result] = await db.execute(sql)
  return result
}

const getUserPreference = async (userId) => {
  const [preference] = await db.execute('SELECT user_preference.*, food.name FROM `user_preference` INNER JOIN `food` ON user_preference.food_id = food.id WHERE user_id = ?', [userId])
  return preference
}

const signUp = async (provider, name, email, password) => {
  const conn = await db.getConnection()
  try {
    const loginAt = new Date()
    const user = {
      provider,
      email,
      password: bcrypt.hashSync(password, salt),
      name,
      picture: null,
      access_expired: TOKEN_EXPIRE,
      login_at: loginAt
    }
    const accessToken = jwt.sign(
      {
        provider: user.provider,
        name: user.name,
        email: user.email,
        picture: user.picture
      },
      TOKEN_SECRET
    )
    user.access_token = accessToken

    const [result] = await conn.execute(
      'INSERT INTO `user` (name, email, password, provider) VALUES (?, ?, ?, ?)',
      [user.name, user.email, user.password, user.provider]
    )
    user.id = result.insertId
    return { user }
  } catch (error) {
    console.error(error)
    return {
      error: 'Email Already Exists',
      status: 400
    }
  } finally {
    await conn.release()
  }
}

const nativeSignIn = async (email, password) => {
  const [user] = await db.query('SELECT * FROM user WHERE email = ?', [email])
  console.log('user: ', user)
  return user
}

const fbSignIn = async (id, name, email) => {
  const conn = await db.getConnection()
  try {
    const user = {
      provider: 'facebook',
      email,
      name,
      picture: 'https://graph.facebook.com/' + id + '/picture?type=large'
    }
    const accessToken = jwt.sign(
      {
        provider: user.provider,
        name: user.name,
        email: user.email,
        picture: user.picture
      },
      TOKEN_SECRET
    )

    const [users] = await conn.query('SELECT id FROM user WHERE email = ? AND provider = \'facebook\'', [email])
    let userId
    if (users.length === 0) {
      const queryStr = 'INSERT INTO user set ?'
      const [result] = await conn.query(queryStr, user)
      userId = result.insertId
    } else {
      userId = users[0].id
    }
    user.id = userId
    return { user, access_token: accessToken }
  } catch (error) {
    return { error }
  } finally {
    await conn.release()
  }
}

const getFacebookProfile = async function (accessToken) {
  try {
    const { data } = await axios({
      url: 'https://graph.facebook.com/me',
      method: 'post',
      params: {
        fields: ['id', 'email', 'name', 'picture'].join(','),
        access_token: accessToken
      }
    })
    return data
  } catch (e) {
    console.log(e)
    throw 'Permissions Error: facebook access token is wrong'
  }
}

module.exports = { signUp, nativeSignIn, fbSignIn, getFacebookProfile, setUserTarget, getUserDetail, updateUserProfile, updateUserBodyInfo, updateNutritionTarget, getUserPreference }

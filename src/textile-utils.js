const { Client, createAPISig, PrivateKey, ThreadID, Where, WriteTransaction } = require("@textile/hub")
const dotenv = require("dotenv");

/**
 * getAPISig uses helper function to create a new sig
 * 
 * seconds (300) time until the sig expires
 */
async function getAPISig(seconds = 300) {
    dotenv.config();
    const expiration = new Date(Date.now() + 1000 * seconds)
    const apiSig = await createAPISig(process.env.USER_API_SECRET, expiration)
    console.log("API_SIG: ", apiSig, process.env.USER_API_SECRET)
    return apiSig
}

/**
 * newClientDB creates a Client (remote DB) connection to the Hub
 * 
 * A Hub connection is required to use the getToken API
 */
async function newClientDB() {
    dotenv.config();

    const API = process.env.USER_API || undefined
    
    const db = await Client.withKeyInfo({
      key: process.env.USER_API_KEY,
      secret: process.env.USER_API_SECRET
    })

    console.log("DB: ", db, API, process.env.USER_API_KEY, process.env.USER_API_SECRET)
    
    return db;
}
  
async function updateOrCreateUser(db, publicKey, newUser) {
  let threadID;  
  const threadList = await db.listThreads()
  const thread = threadList.find((obj) => obj.name === 'UserNFTThread')
  threadList.map(thread => {
    if (thread.name === '') {
      db.deleteDB(ThreadID.fromString(thread.id))
    }
  })

  if (threadList.length < 1 || !thread) {
    threadID = await db.newDB(ThreadID.fromRandom(), 'UserNFTThread')
    await db.newCollection(threadID, {
      name: 'UserData',
    })
  } else {
    threadID = ThreadID.fromString(thread.id)
  }

  const query = new Where('publicKey').eq(publicKey)
                  
  const tx = db.writeTransaction(threadID, 'UserData');

  await tx.start();
  
  let user = await tx.find(query);

  if (user.length > 0) {
      user[0].lastSeen = new Date();
      await tx.save(user);
  } else {
      newUser.lastSeen = new Date();
      await tx.create(
          [ newUser ]
      )
  }

  await tx.end();  

  return user.length > 0 ? user[0] : newUser
}


module.exports = {
    getAPISig,
    newClientDB,
    updateOrCreateUser
}

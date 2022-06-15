const Koa = require('koa');
const Router = require('@koa/router');
const Emittery = require('emittery');
// const Router = require("koa-router");
const logger = require("koa-logger");
const json = require("koa-json");
const bodyParser = require("koa-bodyparser");
const websockify = require("koa-websocket");
const cors = require("@koa/cors");
const dotenv = require("dotenv");
const { newClientDB, getAPISig, updateOrCreateUser } = require('./textile-utils');
const { Where, ThreadID, WriteTransaction } = require('@textile/hub');

dotenv.config();

console.log({
    api: process.env.USER_API,
    key: process.env.USER_API_KEY,
    secret: process.env.USER_API_SECRET
})

const app = websockify(new Koa());

app.use(json())
app.use(logger())
app.use(bodyParser())
app.use(cors());

const wsRouter = Router();
const router = Router();

// Regular middleware
wsRouter.use((ctx, next) => {
  ctx.set('Access-Control-Allow-Origin', '*');
  ctx.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  ctx.set('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
  return next(ctx);
});

wsRouter.get('/', ctx => {
    const emitter = new Emittery()
    ctx.websocket.on('message', async msg => {
        try {
            const data = JSON.parse(msg);
            switch (data.type) {
                case 'token': {
                    if (!data.pubkey) { throw new Error('missing newUser.identity.public.toString()') }
                    const db = await newClientDB()
                    const token = await db.getTokenChallenge(
                        data.pubkey, 
                        (challenge) => {
                        return new Promise((resolve, reject) => {
                            ctx.websocket.send(JSON.stringify({
                                type: 'challenge',
                                value: Buffer.from(challenge).toJSON(),
                            }))
                            emitter.on('challenge', (sig) => {
                                console.log('SOCKET_CHALLENGE_RESPONSE: ', challenge)
                                resolve(Buffer.from(sig))
                            })
                            setTimeout(() => {
                                reject()
                            }, 10000)
                        })
                    })

                    console.log("SOCKET_USER_PREOP: ", data)

                    const user = await updateOrCreateUser(db, data.pubkey, data.newUser)

                    console.log("SOCKET_USER: ", user)

                    const auth = await getAPISig(3000)
                    const payload = {
                        ...auth,
                        token: token,
                        key: process.env.USER_API_KEY,
                    }
                    const res = {
                        type: 'token',
                        value: {
                            payload,
                            user: user
                        }
                    }
                    ctx.websocket.send(JSON.stringify(res))
                    break
                }
                case 'challenge': {
                    if (!data.sig) { 
                        throw new Error('missing signature (sig)') 
                    } else {
                        await emitter.emit('challenge', data.sig);
                        break        
                    }
                }
            }
        } catch (error) {
            ctx.websocket.send(JSON.stringify({
                type: 'error',
                value: error,
            })) 
        }
    });
});

// A normal http route to set up a basic ws test
// router.get('/', async (ctx, next) => {
//   ctx.body = `<script>
//     ws = new WebSocket("ws://localhost:3001");
//     ws.addEventListener('open', () => { ws.send("ping"); });
//   </script>Check the network inspector!`;
//   return next;
// });

// Attach both routers
// Note it's app.ws.use for our ws router
app.ws.use(wsRouter.routes()).use(wsRouter.allowedMethods());
app.use(router.routes()).use(router.allowedMethods());

app.listen(3001);
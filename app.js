const { ApolloServer, gql } = require('apollo-server')
const runningAt = require('running-at')

const {
    getChats,
    sendNewMessage,
    mapFriendlyChatNamesToChats,
    getChatMessagesByArgs,
    cleanChattersInMessages,
    getChatInformationFromArgs,
    getAllMessagesInChatWithDate,
    getLoggedInUseriMessageHandle
} = require('./imessage.js')

const DEBUGGING = true

const typeDefs = gql`
  type ChatMessage {
    chatter: String
    text: String
  }
  type Chat {
    name: String
    friendlyName: String
  }
  type ChatCount {
    friendlyName: String
    count: Int
  }
  type Query {
    getChats: [Chat]
    getChatCounts: [ChatCount]
    getMessages(chatId: String, page: String): [ChatMessage]
    sendMessage(chatId: String, message: String): [ChatMessage]
  }
`;

let cacheArgs
let cacheChatMessages
let chatMessageCounts

const updateIterationProgress = () => {
    console.log('iteration progress updated')

    // if (iterationProgress.value === 100) {

    //     iterationProgress.reset()
    // }

    // iterationProgress.progress(1)
    // screen.render()
}

const updateMessageSendProgress = () => {

    if (messageSendProgress.value === 100) {

        messageSendProgress.reset()
    }

    messageSendProgress.progress(1)
    screen.render()
}

const updateHTTPRequestsProgress = () => {

    if (HTTPRequestsProgress.value === 100) {

        HTTPRequestsProgress.reset()
    }

    HTTPRequestsProgress.progress(1)
    screen.render()
}

const updateChatMessageCounts = async (chats) => {

    if (!chatMessageCounts) {

        chatMessageCounts = {}
    }

    chats = await mapFriendlyChatNamesToChats(chats)

    for (const chat of chats) {

        if (!chatMessageCounts[chat.friendlyName]) {

            chatMessageCounts[chat.friendlyName] = {
                count: 0,
                timestamp: new Date().getTime()
            }
        }

        let messages = await getAllMessagesInChatWithDate(chat.name, chatMessageCounts[chat.friendlyName].timestamp)

        if (chatMessageCounts[chat.friendlyName].count !== messages.length) {

            if (DEBUGGING) {

                console.log(`updated count for chat ${chat.friendlyName}: from ${chatMessageCounts[chat.friendlyName]} to ${messages.length}`)
            }

            chatMessageCounts[chat.friendlyName].count = messages.length
        }
    }

    return
}

const resolvers = {
    Query: {
        sendMessage: async (parent, args, context, info) => {

            updateHTTPRequestsProgress()

            let { selectedChatId, selectedChatFriendlyName } = await getChatInformationFromArgs(args)
            args.message = decodeURIComponent(args.message)

            if (DEBUGGING) {

                console.log(`send to ${selectedChatId}, ${selectedChatFriendlyName}: ${args.message}`)
            }

            if (selectedChatId.startsWith(`chat`)) {

                await sendNewMessage(`iMessage;+;${selectedChatId}`, args.message)
            } else {

                await sendNewMessage(`iMessage;-;${selectedChatId}`, args.message)
            }

            let { chatMessages } = await getChatMessagesByArgs(args)
            chatMessages = await cleanChattersInMessages(chatMessages)

            //chatMessages.push({chatter: `me`, text: args.message})

            updateMessageSendProgress()

            return chatMessages
        },
        getChats: async () => {

            updateHTTPRequestsProgress()

            let chats = await getChats()

            await updateChatMessageCounts(chats)

            if (DEBUGGING) {

                console.log(`getChats: ${chats.length}`)
            }

            return chats
        },
        getChatCounts: async () => {

            updateHTTPRequestsProgress()

            const chatFriendlyNames = Object.getOwnPropertyNames(chatMessageCounts)

            const counts = chatFriendlyNames.map(friendlyName => {

                return { friendlyName: friendlyName, count: chatMessageCounts[friendlyName].count }
            })

            if (DEBUGGING) {

                console.log(`getChatCounts`)
                console.log(counts)
            }

            return counts
        },
        getMessages: async (parent, args, context, info) => {

            updateHTTPRequestsProgress()

            if (JSON.stringify(args) === JSON.stringify(cacheArgs)) {

                return cacheChatMessages
            }

            cacheArgs = args

            let { chatMessages } = await getChatMessagesByArgs(args)
            let { selectedChatId, selectedChatFriendlyName } = await getChatInformationFromArgs(args)

            activeChatId = selectedChatId

            chatMessageCounts[selectedChatFriendlyName].timestamp = new Date().getTime()
            chatMessageCounts[selectedChatFriendlyName].count = 0

            chatMessages = await cleanChattersInMessages(chatMessages)

            return chatMessages
        }
    }
};

const server = new ApolloServer({ typeDefs, resolvers });

server.listen().then(async ({ url }) => {

    if (DEBUGGING) {

        console.log(`🚀  Server ready at ${url}`);
    }

    let runningAtOutput = runningAt()

    if (DEBUGGING) {

        console.log(`runningAtOutput`)
        console.log(runningAtOutput)
    }

    let chatHandle = await getLoggedInUseriMessageHandle()
    console.log(`logged in as user: ${chatHandle}`)
});

let cacheUpdates = 0
let clearCounter = 0

setInterval(async () => {

    if (clearCounter++ > 10000) {

        clearCounter = 0
    }

    updateIterationProgress()

    try {

        const myCacheUpdate = Number(cacheUpdates++)

        let chats

        if (!cacheArgs) {

            chats = await getChats()

            await updateChatMessageCounts(chats)

            if (DEBUGGING) {

                console.log(`${myCacheUpdate}: no cached args, bail on interval`)
                console.log(`chats: ${JSON.stringify(chats)}`)
            }

            return
        }

        if (DEBUGGING) {

            console.log(`${myCacheUpdate}: updating caches...`)
        }


        let { chatMessages } = await getChatMessagesByArgs(cacheArgs)

        cacheChatMessages = await cleanChattersInMessages(chatMessages)

        chats = await getChats()

        await updateChatMessageCounts(chats)

        if (DEBUGGING) {

            console.log(`${myCacheUpdate}: done updating caches`)
        }
    } catch (err) {

        if (DEBUGGING) {

            console.log(err)
        }
    }
}, 3000)
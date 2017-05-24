import moment from 'moment'
import { RtmClient, MemoryDataStore, CLIENT_EVENTS, RTM_EVENTS } from '@slack/client'
import winston from 'winston'

import CommandRouter from './router'
import { performNodeCheck, showHelpText } from './commands'

const TIMESTAMP_FORMAT = 'HH:mm:ss.SSS'
const REQUEST_NODE_CHECK_REGEX = /^!check\s+([a-z0-9-_]+)/i
const REQUEST_HELP_REGEX = /^!help/i

// Initialize the logger instance
const logger = new winston.Logger()
  .add(winston.transports.Console, {
    label: 'bot',
    timestamp: () => `[${moment.utc().format(TIMESTAMP_FORMAT)}]`,
    colorize: true,
    prettyPrint: true,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  })

// Get bot parameters from environment vars
const botToken = process.env.SLACK_BOT_TOKEN || ''
const botChannel = process.env.SLACK_BOT_CHANNEL || ''

// Create the RTM client (using in-memory datastore)
const rtm = new RtmClient(botToken, {
  logLevel: 'error',
  datastore: new MemoryDataStore()
})

// Create command router
const router = new CommandRouter(rtm, logger)
router.addHandler(REQUEST_NODE_CHECK_REGEX, performNodeCheck)
router.addHandler(REQUEST_HELP_REGEX, showHelpText)

// When the client is authenticated
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (startData) => {
  logger.info(`Connected to Slack successfully. (${startData.team.name})`)
  const memberChannels = startData.channels.filter(ch => ch.is_member)

  // Check that the bot is a member of the channel he wants to monitor
  if (!memberChannels.some(ch => ch.name === botChannel)) {
    logger.warn(`Bot is not a member of channel #${botChannel}!`)
  }
})

// When a message arrives, handle it
rtm.on(RTM_EVENTS.MESSAGE, (message) => {
  const user = rtm.dataStore.getUserById(message.user)
  const channel = rtm.dataStore.getChannelGroupOrDMById(message.channel)

  // Ignore if there is no user, no channel, or not the channel the bot is monitoring
  if (!user || !channel || channel.name !== botChannel) {
    return
  }

  // Handle the message via command router
  router.handleMessage(message)
})

// Start the RTM client
logger.info('Attempting to connect to Slack...')
rtm.start()
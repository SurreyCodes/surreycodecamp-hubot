'use strict';

/*
 * This hubot script checks the Surrey Code Camp meetup site and alerts the #general channel of any
 * new upcoming meetups. It also serves as an example of how to go about writing a script in JS rather
 * than coffeescript as well as using timers and responding to actions.
 */

// import depedendencies
const request = require('request');
const Redis = require('redis');
const RedisUrl = require('redis-url');
const moment = require('moment-timezone');

// set up some constants, some values pulled from environment variables
const LAST_ANNOUNCED_KEY = 'events:last-announced';
const NOTIFICATION_CHANNEL = process.env.HUBOT_MEETUP_NOTIFICATION_CHANNEL || null;
const MEETUP_CHECK_INTERVAL = parseInt(process.env.HUBOT_MEETUP_CHECK_INTERVAL || '10') * 60 * 1000;
const MEETUP_GROUP_NAME = process.env.HUBOT_MEETUP_GROUP_NAME || 'Surrey-Code-Camp';


/**
 * Utility function using Promises to fetch upcoming meetups
 */
function getUpcomingMeetups() {
  return new Promise((fulfill, reject) => {
    request(`https://api.meetup.com/${MEETUP_GROUP_NAME}/events`, (err, resp, events) => {
      if (err) reject(err);
      events = JSON.parse(events).filter(ev => { return ev.status === 'upcoming'; });
      events.sort((a, b) => { return a.time > b.time; });

      fulfill(events);
    });
  });
}


/**
 * Class holding the business logic and handlers for Meetup-related actions
 */
class Meetup {
  constructor(hubot) {
    this.hubot = hubot;
    this.redis = null;

    // set up command handlers
    this.hubot.respond(/show upcoming meetups/i, this.cmdShowUpcoming.bind(this));
  }

  /**
   * Initialization method
   *
   * As a (subjective) best practice, I tend to only set constant values in constructors. Anything functional
   * that may reach out to external services and such are put in some form of an initialization method.
   */
  initialize() {
    // an environment variable is used here as opposed to harcoding the string because it'll differ between
    // running on a local machine and after deployment to heroku. this follows the 12 factor principles for config:
    // https://12factor.net/config.
    if (process.env.REDIS_URL) {
      let parts = RedisUrl.parse(process.env.REDIS_URL);
      let opts = { password: parts.password || null, db: parts.database || null };

      // try to set the redis client. if there's an error, log it so that we can check out what's going on.
      try {
        this.redis = Redis.createClient(parts.port, parts.hostname, opts);
      } catch(err) {
        this.hubot.logger.error(err);
      }
    }

    // only do the time-based announcements if redis is connected. if it's not, then we can still get
    // the upcoming meetups through the command line. if we were to announce regardless of redis connection,
    // we'd get announcements every time hubot restarts (in the heroku world, that's on every deployment or
    // config change). not the end of the world, but a little annoying.
    if (this.redis) {
      this.redis.get(LAST_ANNOUNCED_KEY, (err, lastAnnounced) => {
        if (err) this.hubot.logger.error(err);
        this.lastAnnounced = parseInt(lastAnnounced || '0');
      });
    }
    if (NOTIFICATION_CHANNEL) setInterval(this.checkForAndAnnounceNewMeetups.bind(this), MEETUP_CHECK_INTERVAL);
  }

  /*
   * Command handler for displaying upcoming meetups
   * @param {hubot.Response} The Response instance injected by hubot
   */
  cmdShowUpcoming(resp) {
    getUpcomingMeetups()
      .then(events => {
        this.announceEvents(events, (msg) => { resp.send(msg); });
      });
  }

  /**
   * Announces the given events using the provided sender method
   * @param {Array} The events from api.meetup.com to build the messages with
   * @param {Function} The callback used to actually send the message to Slack
   */
  announceEvents(events, sender) { 
    events
      .map(ev => {
      let message = {
        text: ev.name,
        attachments: [
          {
            fields: [
              {title: 'Where', value: `${ev.venue.name}\n${ev.venue.address_1}, ${ev.venue.city}`, short: true},
              {
                title: 'When',
                value: moment(new Date(ev.time).toISOString()).tz('America/Vancouver').format('h:ma'),
                short: true
              }
            ],
            "thumb_url": "https://secure.meetupstatic.com/s/img/422066906568/logo/swarm/m_swarm_128x128.png",
            "footer": ev.link
          }
        ]
      };
      sender(message);
    })

    // if there's a valid redis connection, store the last announced date. regardless of whether this
    // announcement was driven by command or timer, we don't want to automatically announce the event again
    if (this.redis && events.length > 0) {
      this.redis.set(LAST_ANNOUNCED_KEY, events[events.length - 1].time, (err, ok) => {
        if (err) this.hubot.error(err);
        this.lastAnnounced = events[events.length - 1].time;
      });
    }
  }

  /**
   * Timer-based method that will check for new meetups and then announce them in the appropriate Slack channel
   */
  checkForAndAnnounceNewMeetups() {
    getUpcomingMeetups()
      .then(events => {
        let unannouncedEvents = events.filter(ev => { return ev.time > this.lastAnnounced; });
        this.hubot.logger.info(`${unannouncedEvents.length} unannounced meetups found`);
        if (unannouncedEvents.length === 0) return;

        this.hubot.logger.info(`Notifying #${NOTIFICATION_CHANNEL} of ${unannouncedEvents.length} unannounced events`);
        this.announceEvents(
          unannouncedEvents,
          (msg) => {
            this.hubot.send({room: `#${NOTIFICATION_CHANNEL}`}, msg);
          }
        );
      });
  }
}

// hubot scripts must export a single function that takes the robot as an argument. this is where class
// instantiation and such will take place.
module.exports = (robot) => {
  let meetup = new Meetup(robot);
  meetup.initialize();
}

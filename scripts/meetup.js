'use strict';

const request = require('request');
const Redis = require('redis');
const RedisUrl = require('redis-url');
const moment = require('moment-timezone');

const LAST_ANNOUNCED_KEY = 'events:last-announced';
const NOTIFICATION_CHANNEL = process.env.HUBOT_MEETUP_NOTIFICATION_CHANNEL || null;
const MEETUP_CHECK_INTERVAL = parseInt(process.env.HUBOT_MEETUP_CHECK_INTERVAL || '10') * 60 * 1000;
const MEETUP_GROUP_NAME = process.env.HUBOT_MEETUP_GROUP_NAME || 'Surrey-Code-Camp';


class Meetup {
  constructor(hubot) {
    this.hubot = hubot;
  }

  initialize() {
    if (process.env.REDIS_URL) {
      let parts = RedisUrl.parse(process.env.REDIS_URL);
      let opts = { password: parts.password || null, db: parts.database || null };

      try {
        this.redis = Redis.createClient(parts.port, parts.hostname, opts);
      } catch(err) {
        this.hubot.logger.error(err);
        this.redis = null;
      }
    }
    if (this.redis) {
      this.redis.get(LAST_ANNOUNCED_KEY, (err, lastAnnounced) => {
        if (err) this.hubot.logger.error(err);
        this.lastAnnounced = lastAnnounced || 0;
      });
    }
    if (NOTIFICATION_CHANNEL) setInterval(this._checkForAndAnnounceNewMeetups.bind(this), MEETUP_CHECK_INTERVAL);
  }

  _checkForAndAnnounceNewMeetups() {
    request(`https://api.meetup.com/${MEETUP_GROUP_NAME}/events`, (err, resp, events) => {
      events = JSON.parse(events);
      if (events.length === 0) return;

      this.hubot.logger.info(`Notifying #${NOTIFICATION_CHANNEL} of ${events.length} new events`);
      events
        .filter(ev => { return ev.time > this.lastAnnounced; })
        .sort((a, b) => { return a.time > b.time })
        .map(ev => {
          let message = {
            text: ev.name,
            attachments: [
              {
                fields: [
                  {title: 'Where', value: `${ev.venue.name}\n${ev.venue.address_1}, ${ev.venue.city}`, short: true},
                  {title: 'When', value: moment(new Date(ev.time).toISOString()).tz('America/Vancouver').format('h:ma')}
                ],
                "thumb_url": "https://secure.meetupstatic.com/s/img/422066906568/logo/swarm/m_swarm_128x128.png",
                "footer": ev.link
              }
            ]
          };
          this.hubot.send({room: NOTIFICATION_CHANNEL}, message);
        });
      this.redis.set(LAST_ANNOUNCED_KEY, events[events.length - 1].time, (err, ok) => {
        if (err) this.hubor.error(err);
        this.lastAnnounced = events[events.length - 1];
      });
    });
  }
}

module.exports = (robot) => {
  let meetup = new Meetup(robot);
  meetup.initialize();
}

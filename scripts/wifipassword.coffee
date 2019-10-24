module.exports = (robot) ->

  robot.hear /(^ponch|\sponch)\s*wifi/i, (msg) ->
    msg.reply "betacollective20!4"
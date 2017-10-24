module.exports = (robot) ->

   # This will hear a mention of ponch and respond with @USERNAME and the below text.
   robot.respond /Thank you/i, (msg) ->
     msg.reply "You're very welcome! Have a fantastic day."

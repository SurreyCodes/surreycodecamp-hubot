module.exports = (robot) ->

   # This will hear a mention of ponch and respond with @USERNAME and the below text.
   #robot.respond /Thank you/ig, (msg) ->
   robot.hear /(^ponch|\sponch)\s(\w*\s)*thank\s?|thank(\w|\s)*ponch/i, (msg) ->
     msg.reply "For sure!"

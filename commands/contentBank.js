const BANK = {
  flirt: ["Are you Wi-Fi? Because I feel a connection.", "If smiles were stars, your sky would be full.", "I was having a normal day until you crossed my mind."],
  dare: ["Send a voice note singing your favourite song for 10 seconds.", "Describe your day using only three emojis.", "Give someone in this chat a genuine compliment."],
  truth: ["What is one thing you wish people understood about you?", "What is the funniest thing that happened to you recently?", "Who was your first crush?"],
  quote: ["Great things are done by a series of small things brought together. — Vincent van Gogh", "It always seems impossible until it's done. — Nelson Mandela", "The secret of getting ahead is getting started. — Mark Twain"],
  goodnight: ["Good night! Rest well and wake up ready for a brighter day. 🌙", "May your worries be light and your dreams be peaceful. Sweet dreams. ✨", "Close your eyes, recharge, and let tomorrow bring fresh possibilities. 💫"],
  shayari: ["Raat ki khamoshi mein ek paighaam aaya,\nChaand ke saath tera khayaal aaya. 🌙", "Muskurahat se roshan rahe har savera,\nKhushiyon se bhara ho har din tera. ❤️", "Dil se nikli dua kabhi khaali nahi jaati,\nSachchi mohabbat kabhi bhulaayi nahi jaati. 🌹"],
  meme: ["POV: You said 'just 5 more minutes' and woke up 3 hours later 😂", "Me: I will save money. Also me: adds everything to cart 🛒", "When the Wi-Fi disconnects for 2 seconds: the whole family starts investigating 😭"]
};
function pick(type) {
  const list = BANK[type] || [];
  return list.length ? list[Math.floor(Math.random() * list.length)] : 'Try again in a moment.';
}
module.exports = { pick };

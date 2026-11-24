const { deliverViewOnce } = require('./viewOnceHelper');
module.exports = async function viewOnceCommand(sock, chatId, message) { return deliverViewOnce(sock, chatId, message, message.key?.participant, false); };

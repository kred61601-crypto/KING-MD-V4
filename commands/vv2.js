const { deliverViewOnce } = require('./viewOnceHelper');
module.exports = async function vv2Command(sock, chatId, message, senderId) { return deliverViewOnce(sock, chatId, message, senderId, true); };

window.TMCS = (function ()
{
    /**
     * @class
     * @param {string} [address] - The address of a TMCS server.
     * @param {bool} [useSsl=false] - Connect with SSL.
     */
    function TMCS(address,useSsl)
    {
        this.address = "";
        this.uid = "";
        this.user = null;
        this.ssl = false;
        this.webSocket = null;//new WebSocket();
        this.connected = false;
        this.status = TMCS.Status.Offline;
        this.contacts = new Array();
        this.clientVersion = TMCS.version;
        this.serverVersion = "0.0.0";
        this.serverName = "TMCS";
        this.serverOwner = "TMCS";
        this.TMCSPubKey = null;
        Event.defineEvent(this, "onMessage");
        Event.defineEvent(this, "onSignal");

        var tmcs = this;
        Object.defineProperty(this, "connected", {
            get: function ()
            {
                if (!tmcs.webSocket)
                    return false;
                return (tmcs.webSocket.readyState == 1);
            }

        });
        var user = null;
        var userSet = false;
        Object.defineProperty(this, "user", {
            get: function ()
            {
                return user;
            },
            set: function (value)
            {
                if (!(value instanceof User))
                    throw new Error("An instance of User required.");
                /*if (userSet)
                    throw new Error("Cannot reset the user.");*/
                userSet = true;
                user = value;
                user.TMCS = tmcs;
            }
        });
        if (address)
            this.address = address;
        if (useSsl)
            this.ssl = true;
    }
    /**
     * The user.
     * @class
     * @param {string} uid - The uid of the user.
     */
    function User(uid)
    {
        this.uid = uid;
        this.token = null;
        this.profile = new UserProfile();
        this.TMCS = new TMCS();
        this.prvKey = null;
        this.prvKeyEnc = null;
        this.authType = null;
        this.salt = null;
        this.authCode = null;
    }
    User.AuthType = { PrivateKey: "PrivateKey", Password: "Password" };
    /**
     * Get the infomation of the user.
     * @param {responseCallback} [callback] - The callback that handles the result.
     */
    User.prototype.getProfile = function (callback)
    {
        if (!this.TMCS && callback)
        {
            callback({ code: -1, data: "Invalid calling." });
            return;
        }
        var user = this;
        this.TMCS.callAPI(
            "/user/" + encodeURIComponent(this.uid),
            "GET",
            null,
            function (result)
            {
                if (result.code != 0)
                {
                    switch (result.code)
                    {
                        case -210:
                            result.data = "Access denied.";
                            break;
                        case -202:
                            result.data = "User dose not exist.";
                            break;
                    }
                }
                else
                {
                    user.profile = new UserProfile();
                    user.profile.nickName = result.data.nickName;
                    user.profile.avatar = result.data.avatar;
                    user.profile.note = result.data.note;
                    user.profile.sex = result.data.sex;
                    user.profile.status = result.data.status;
                    user.profile.tag = result.data.tag;
                    user.profile.pubKey = result.data.pubKey;
                }

                if (callback)
                    callback(result);
            });
    }
    TMCS.User = User;
    function UserProfile()
    {
        this.nickName = "";
        this.sex = "Unknown";
        this.avatar = "http://img.sardinefish.com/NDc2NTU2";
        this.status = "Offline";
        this.note = "";
        this.tag = "";
    }
    TMCS.UserProfile = UserProfile;

    /**
     * The Friend.
     * @param {string} uid - The uid of the contact.
     */
    function Friend(uid)
    {
        this.uid = uid;
        this.profile = new UserProfile();
        this.tag = "";
        this.note = "";
        this.group = "";
    }
    /**
     * Get the infomation of the contact.
     * @param {responseCallback} [callback] - The callback that handles the result.
     */
    Friend.prototype.getProfile = function (callback)
    {
        if (!this.TMCS && callback) {
            callback({ code: -1, data: "Invalid calling." });
            return;
        }
        var contact = this;
        this.TMCS.callAPI(
            "/user/" + encodeURIComponent(this.uid),
            "GET",
            null,
            function (result)
            {
                if (result.code != 0) {
                    switch (result.code) {
                        case -210:
                            result.data = "Access denied.";
                            break;
                        case -202:
                            result.data = "User dose not exist.";
                            break;
                    }
                }
                else {
                    contact.profile = new UserProfile();
                    contact.profile.nickName = result.data.nickName;
                    contact.profile.avatar = result.data.avatar;
                    contact.profile.note = result.data.note;
                    contact.profile.sex = result.data.sex;
                    contact.profile.status = result.data.status;
                    contact.profile.tag = result.data.tag;
                    contact.profile.pubKey = result.data.pubKey;
                }

                if (callback)
                    callback(result);
            });
    }
    TMCS.Friend = Friend;

    /**
     * The result of an api calling.
     * @class
     * @param {number} code - The error code of the result;
     * @param {object} data - The data of the result;
     */
    function APIResult(code, data)
    {
        this.code = code;
        this.data = data;
    }

    /**
     * A message to be sent.
     * @class
     * @param {object} sender - The sender.
     * @param {string} receiver - The receiver.
     * @param {object} data - The message.
     */
    function Message(sender, receiver, data)
    {
        this.sender = sender;
        this.receiver = receiver;
        this.data = data;
    }
    TMCS.Message = Message;
    
    /**
    * Enum for TMCS status.
    * @readonly
    * @public
    * @enum {number}
    */
    TMCS.Status = { Offline: 0, Connecting: 1, HandShaking: 2, Online: 3, Closing: 4 };
    TMCS.MessageType={Message:"Message",Signal:"Signal"};
    /**
     * The version of the TMCS client.
     * @public
     * @static
     */
    TMCS.version = "0.1.0";

    /**
     * Connect to the TMCS server.
     * @public
     * @param {resultCallback} [callback] - The callback that handles the result.
     */
    TMCS.prototype.connect = function (callback)
    {
        if (!this.address)
            throw new Error("Address required.");
        var tmcs = this;
        this.status = TMCS.Status.Connecting;
        var url = "";
        if (this.ssl)
        {
            url = "wss://" + this.address + "/ws";
        }
        else
        {
            url = "ws://" + this.address + "/ws";
        }
        this.webSocket = new WebSocket(url);
        this.webSocket.onopen = function (e)
        {
            tmcs.status = TMCS.Status.HandShaking;
            if (callback)
                callback({ code: 0, data: null });
        }

    };



    TMCS.prototype.initWebSocket = function (callback)
    {
        var tmcs = this;
        if(!this.user || !this.user.prvKey){
            if(callback)
                callback({code:1,data:"Please login."});
            return;
        }
        // Check connection and connect if disconnected.
        if (!this.connected) {
            this.connect(function (result)
            {
                tmcs.initWebSocket(callback);
            });
            return;
        }
        // Check TMCS public key and get it if lost.
        if (!this.TMCSPubKey || this.TMCSPubKey == "")
        {
            this.handshake(function (result)
            {
                if (result == 0)
                    tmcs.initWebSocket(callback);

                else if (callback)
                    callback(result);
            });
            return;
        }

        this.webSocket.onmessage = function (e)
        {
            var receive = JSON.parse(e.data);
            if (receive.type === "Signal" && receive.data.signal === "HandShake") {
                tmcs.webSocket.onmessage = function (e) { tmcs.onMessageCallback(e); };
                tmcs.webSocket.send(JSON.stringify({
                    type: "Signal",
                    receiverId: "TMCS",
                    data: {
                        signal: "Ready",
                        data: null
                    }
                }))
                tmcs.status = TMCS.Status.Online;
                if (callback)
                    callback({ code: 0, data: receive.data.data });
            }
            else if(callback) {
                callback({ code: 1, data: "Unknown Error." });
            }
        };
        var enc = new JSEncrypt();
        enc.setPublicKey(this.TMCSPubKey);
        
        this.webSocket.send(JSON.stringify({
            type: "Signal",
            receiverId: "TMCS",
            data: {
                signal: "HandShake",
                data: {
                    uid: this.user.uid,
                    token: this.user.token
                }
            }
        })); 
    }

    TMCS.prototype.sendMessage = function (receiverId, type, data, callback)
    {
        var tmcs = this;
        if (this.status != TMCS.Status.Online)
        {
            if (callback)
                callback({ code: 1, data: "You are now offline." });
            return;
        }
        var pubKey = "";
        if (receiverId == "TMCS")
        {
            pubKey = this.TMCSPubKey;
            send();
        }
        else if (this.contacts[receiverId])
        {
            pubKey = this.contacts[receiverId].profile.pubKey;
            send();
        }
        else
        {
            this.getUserProfile(receiverId, function (result)
            {
                if (result.code != 0 && callback)
                    callback(result);
                else
                {
                    pubKey = result.data.pubKey;
                    send();
                }
            });
        }

        function send()
        {
            var dataEnc = RSABlockEncrypt(JSON.stringify({
                type: type,
                data: data
            }), pubKey);
            tmcs.webSocket.send(JSON.stringify({
                type: TMCS.MessageType.Message,
                receiverId: receiverId,
                data: dataEnc
            }));
            if (callback) {
                callback({ code: 0, data: null });
            }
        }
    }

    TMCS.prototype.sendSignal = function (receiverId, signal, data, callback)
    {
        var tmcs = this;
        if (this.status != TMCS.Status.Online) {
            if (callback)
                callback({ code: 1, data: "You are now offline." });
            return;
        }
        var pubKey = "";
        if (receiverId == "TMCS") {
            pubKey = this.TMCSPubKey;
            send();
        }
        else if (this.contacts[receiverId]) {
            pubKey = this.contacts[receiverId].profile.pubKey;
            send();
        }
        else {
            this.getUserProfile(receiverId, function (result)
            {
                if (result.code != 0 && callback)
                    callback(result);
                else {
                    pubKey = result.data.pubKey;
                    send();
                }
            });
        }

        function send()
        {
            var dataEnc = RSAEncrypt(data, pubKey);
            tmcs.webSocket.send(JSON.stringify({
                type: TMCS.MessageType.Message,
                receiverId: receiverId,
                data: {
                    type: type,
                    data: dataEnc
                }
            }));
            if (callback) {
                callback({ code: 0, data: null });
            }
        }
    }

    TMCS.prototype.onMessageCallback = function (e)
    {
        var dataRcv = JSON.parse(e.data);
        if (dataRcv instanceof Array)
        {
            for (var i = 0; i < dataRcv.length; i++)
            {
                if (dataRcv[i].type == TMCS.MessageType.Signal)
                {
                    this._signalCallback(dataRcv[i]);
                }
                else if (dataRcv[i].type == TMCS.MessageType.Message)
                {
                    this._messageCallback(dataRcv[i]);
                }
            }
        }
        else
        {
            if (dataRcv.type == TMCS.MessageType.Signal)
            {
                this._signalCallback(dataRcv);
            }
            else if (dataRcv.type == TMCS.MessageType.Message)
            {
                this._messageCallback(dataRcv);
            }
        }
    }

    TMCS.prototype._signalCallback = function (data)
    {
        var signal;
        if (msgPackage.senderId != "TMCS") {
            signal = RSABlockDecrypt(msgPackage.data, this.user.prvKey);
            signal = JSON.parse(signal);
            msgPackage.data = signal;
        }
        this.onSignal.invoke(msgPackage);
    }

    TMCS.prototype._messageCallback = function (msgPackage)
    {
        var msg;
        if (msgPackage.senderId != "TMCS")
        {
            msg = RSABlockDecrypt(msgPackage.data, this.user.prvKey);
            msg = JSON.parse(msg);
            msgPackage.data = msg;
        }
        this.onMessage.invoke(msgPackage);
    }

    /**
     * @param {string} url - The URL of the API.
     * @param {object} params - The parameters.
     * @param {string} method - The method of the http request.
     * @param {responseCallback} [callback] - The callback that handles the result.
     */ 
    TMCS.prototype.callAPI = function (url, method, params, callback)
    {
        if (!this.address)
            throw new Error("The address of the TMCS server is required.");
        var request = new XMLHttpRequest();
        if (this.ssl) {
            request.open(method.toUpperCase(), "https://" + this.address + "/api" + url);
        }
        else {
            request.open(method.toUpperCase(), "http://" + this.address + "/api" + url);
        }
        if (method.toUpperCase() === "PUT" || method.toUpperCase() === "POST")
            request.setRequestHeader("Content-Type", "application/json");
        //request.setRequestHeader("Cache-Control", "no-cache");
        request.withCredentials = true;
        request.onreadystatechange = function (e)
        {
            if (request.readyState != 4)
                return;
            if (!callback)
                return;
            var code = 1;
            var data = "Unknown Error.";
            if (request.status != 200)
            {
                code = request.status;
                data = request.statusText;
            }
            else
            {
                try {
                    if (request.responseText == "")
                        throw new Error();
                    var result = JSON.parse(request.responseText);
                    code = result.code;
                    data = result.data;
                }
                catch (ex) {
                    code = -110;
                    data = "HTTP Response error."
                }
            }
            callback(new APIResult(code, data));
        }
        request.send(JSON.stringify(params));

    };

    /**
     * @private Shake hand with the TMCS server.
     */
    TMCS.prototype.handshake = function (callback)
    {
        var tmcs = this;
        this.callAPI("/handshake", "GET", null, function (result)
        {
            if (result.code == 0) {
                tmcs.serverName = result.data.serverName;
                tmcs.serverOwner = result.data.owner;
                tmcs.serverVersion = result.data.version;
                tmcs.TMCSPubKey = result.data.pubKey;
            }
            if (callback)
                callback(result);
        });
    };
    

    /**
    * Login with password or private key.
    * @function
    * @param {string} uid - The uid of the user.
    * @param {string} key - The password or privateKey of the user.
    * @param {resultCallback} [callback] - The callback that handles the result.
    * @return undefined
    */
    TMCS.prototype.login = function (uid, key, callback)
    {
        var tmcs = this;
        if (!this.user || !this.user.authType)
        {
            this.getLoginMethod(uid, function (result)
            {
                if (result.code != 0 && callback) {
                    callback(result);
                }
                else
                    tmcs.login(callback);

            });
            return;
        }
        //Auth by password.
        if (this.user.authType== User.AuthType.Password) {
            var salt = this.user.salt;
            var hashKey = CryptoJS.SHA256(key + salt).toString();
            var prvKeyEnc = this.user.prvKeyEnc;
            var prvKey = AES_CBC_Decrypt(prvKeyEnc, hashKey);
            var authCode = RSADecrypt(this.user.authCode, prvKey);
            if (!authCode) {
                if (callback)
                    callback({ code: -201, data: "Password incorrect." });
                return;
            }
            tmcs.callAPI(
                "/login/key-auth",
                "POST",
                {
                    uid: uid,
                    authCode: authCode
                },
                function (result)
                {
                    if (result.code != 0) {
                        switch (result.code) {
                            case -202:
                                result.data = "User dose not exist.";
                                break;
                            case -201:
                                result.data = "Password incorrect.";
                                break;
                            case -100:
                                result.data = "Invalid parameters.";
                                break;
                        }
                    }
                    else {
                        tmcs.user.token = result.data.token;
                        tmcs.status = TMCS.Status.Online;
                        tmcs.user.prvKey = prvKey;
                    }
                    if (callback)
                        callback(result);
                });
        }
        //Auth by private key.
        else if (this.user.authType == "PrivateKey") {
            var authCode = RSADecrypt(tmcs.user.authCode, key);
            if (!authCode) {
                if (callback)
                    callback({ code: -201, data: "Private key incorrect." });
                return;
            }
            tmcs.callAPI(
                "/login/key-auth",
                "POST",
                {
                    uid: uid,
                    authCode: authCode
                },
                function (result)
                {
                    if (result.code != 0) {
                        switch (result.code) {
                            case -202:
                                result.data = "User dose not exist.";
                                break;
                            case -201:
                                result.data = "Private key incorrect.";
                                break;
                            case -100:
                                result.data = "Invalid parameters.";
                                break;
                        }
                    }
                    else {
                        tmcs.user.token = result.data.token;
                        tmcs.user.prvKey = key;
                        tmcs.status = TMCS.Status.Online;
                    }
                    if (callback)
                        callback(result);
                });
        }
        else {
            result.data = "Invalid Login method.";
            if (callback)
                callback(result);
        }
    };

    /**
     * Get the login method and data.
     * @param {string} uid - The uid of the user to login.
     * @param {resultCallback} [callback] - The callback that handles the result.
     */
    TMCS.prototype.getLoginMethod = function (uid, callback)
    {
        this.user = new User(uid);
        var tmcs = this;
        this.callAPI("/login/" + encodeURIComponent(uid), "GET", null, function (result)
        {
            if (!callback)
                return;

            if (result.code != 0)
            {
                switch (result.code)
                {
                    case -202:
                        result.data = "User dose not exist.";
                        break;
                }
            }
            else
            {
                tmcs.user.authType = result.data.authType;
                tmcs.user.authCode = result.data.authCode;
                tmcs.user.salt = result.data.salt;
                tmcs.user.prvKeyEnc = result.data.prvKeyEnc;
            }
            callback(result);
        });
    };

    /**
    * Register a user.
    * @param {string} uid - The uid of the user.
    * @param {string} pubKey - The public key.
    * @param {resultCallback} [callback] - The callback that handles the result.
    */
    TMCS.prototype.register = function (uid, pubKey, callback)
    {

    };

    /**
     * Set the infomation of the user.
     * @param {string} key - The name of the info.
     * @param {string|number} value - The value of the info.
     * @param {resultCallback} [callback] - The callback that handles the result.
     */
    TMCS.prototype.setInfo = function (key, value, callback)
    {
        
    };

    /**
     * Get the infomation of the user.
     * @param {string} uid - The name of the user.
     * @param {resultCallback} callback - The callback that handles the result.
     *//**
     * Get the infomation of the current user.
     * @param {resultCallback} callback - The callback that handels the result.
     */
    TMCS.prototype.getUserProfile = function (uid, callback)
    {
        
        var tmcs = this;
        this.callAPI("/user/" + encodeURIComponent(uid), "GET", null, function (result)
        {
            if (result.code != 0) {
                switch (result.code)
                {
                    case -210:
                        result.data = "Access denied.";
                        break;
                    case -202:
                        result.data = "User does not exist.";
                        break;
                    default:
                        result.data = "Unknown error.";
                        break;
                }
            }
            if (callback)
                callback(result);
        });
    };

    /**
     * Get the contacts list of the user.
     * @param {resultCallback} [callback] - The callback that handles the result.
     */
    TMCS.prototype.getContacts = function (callback)
    {
        if (this.status != TMCS.Status.Online)
        {
            callback({ code: -1, data: "You are offline." });
            return;
        }
        var tmcs = this;
        this.callAPI("/contact", "GET", null, function (result)
        {
            if(!result.code==0)
            {
                switch (result.code)
                {
                    case -210:
                        result.data = "Access denied.";
                        break;
                }
            }
            else 
            {
                tmcs.contacts = ArrayList();
                for (var i = 0; i < result.data.length; i++)
                {
                    var data = result.data[i];
                    /*var contact = new Friend(data.uid);
                    contact.group = data.group;
                    contact.note = data.note;
                    contact.tag = data.tag;*/
                    tmcs.contacts.add(data);
                    tmcs.contacts[data.profile.uid]=data;
                }
                result.data = tmcs.contacts;
            }
            if (callback)
                callback(result);
        });
    };

    /**
     * Add a user as contact.
     * @param {string} uid - The uid of the contact.
     * @param {resultCallback} [callback] - The callback that handles the result.
     */
    TMCS.prototype.addContact = function (uid, callback)
    {

    };

    /**
     * Remove a contact.
     * @param {string} uid - The uid of the user to be removed.
     * @param {resultCallback} [callback] - The callback that handles the result.
     */
    TMCS.prototype.removeContact = function (uid, callback)
    {

    };

    /**
     * Send some messages to other.
     * @param {Message[]} messages - The array of the messages to be sent.
     * @param {resultCallback} [callback] - The callback that handles the result.
     */
    TMCS.prototype.sendMsg = function (messages, callback)
    {
        
    }

    function RSAEncrypt(data, pubKey)
    {
        var jsenc = new JSEncrypt();
        jsenc.setPublicKey(pubKey);
        return jsenc.encrypt(data);
    }

    function RSADecrypt(data, prvKey)
    {
        var jsenc = new JSEncrypt();
        jsenc.setPrivateKey(prvKey);
        return jsenc.decrypt(data);
    }

    function b64len(s)
    {
        var eqCount = 0;
        if (s[s.length - 1] === "=") eqCount++;
        if (s[s.length - 2] === "=") eqCount++;
        return s.length * 3 / 4 - eqCount;
    }

    /**
     * RSABlockEncrypt
     * @param {string} data - The data to be encrypt.
     * @param {string} pubKey - The public key.
     */
    function RSABlockEncrypt(data, pubKey)
    {
        var jsenc = new JSEncrypt();
        jsenc.setPublicKey(pubKey);
        var dataTest = jsenc.encrypt("a");
        var length = b64len(dataTest) - 11;
        var dataBase64 = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(data));
        var idx = 0;
        var dataEnc = "";
        for (var idx = 0; idx < dataBase64.length; idx += length)
        {
            var block = dataBase64.substr(idx, length);
            
            dataEnc += ("|" + jsenc.encrypt(block));
        }
        return dataEnc;
    }

    /**
     * RSABlockEncrypt
     * @param {string} data - The data to be decrypt.
     * @param {string} pubKey - The private key.
     */
    function RSABlockDecrypt(data, prvKey)
    {
        var jsenc = new JSEncrypt();
        jsenc.setPrivateKey(prvKey);
        var dataEncList = data.split("|");
        var dataDec = "";
        for (var i = 0; i < dataEncList.length; i++)
        {
            var dataEnc = dataEncList[i];
            if (dataEnc == "")
                continue;
            dataDec += jsenc.decrypt(dataEnc);
        }
        dataDec = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(dataDec));
        return dataDec;
    }

    function AES_CBC_Encrypt(data, key)
    {
        return CryptoJS.AES(data, key, { mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.ZeroPadding }).toString();
    }

    function AES_CBC_Decrypt(data, key)
    {
        return CryptoJS.AES.decrypt(data, key, { mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.ZeroPadding }).toString(CryptoJS.enc.Utf8);
    }

    //ArrayList
    function ArrayList()
    {
        var list=[];
        list.add = function (obj)
        {
            list[list.length] = obj;
            return list.length - 1;
        };
        list.insert = function (obj, index)
        {
            if (isNaN(index) || index < 0)
            {
                throw new Error("Invalid index.");
            }
            for (var i = this.length-1; i >=index; i--)
            {
                this[i + 1] = this[i];
            }
            this[index] = obj;
        }
        list.removeAt = function (index)
        {
            if (isNaN(index) || index < 0 || index >= list.length)
            {
                throw new Error("Invalid index.");
            }
            for (var i = index; i < list.length - 1; i++)
            {
                list[i] = list[i + 1];
            }
            list.length -= 1;
        }
        list.remove = function (obj)
        {
            for (var i = 0; i < list.length; i++)
            {
                if (list[i] == obj)
                {
                    for (; i < list.length - 1; i++)
                    {
                        list[i] = list[i + 1];
                    }
                    list.length -= 1;
                    return;
                }
            }
            throw new Error("Object not found.");
        }
        list.clear = function ()
        {
            list.length = 0;
        }
        list.addRange = function (arr, startIndex, count)
        {
            if (!startIndex || isNaN(startIndex))
                startIndex = 0;
            if (!count || isNaN(count))
                count = arr.length;
            for (var i = startIndex; i < count; i++)
            {
                list[list.length] = arr[i];
            }
        }
        list.contain = function (obj)
        {
            return (list.indexOf(obj) >= 0);
        }
        return list;
    }

    
    var Event=(function()
    {
        /**
         * The Event Class.
         * @class
         */
        function Event()
        {
            this.def=null;
            this.handlers=ArrayList();
        }
        /**
         * Invoke the event handlers
         * @param {object} [args] - The arguments to be sent to the event handler.
         */
        Event.prototype.invoke=function(args)
        {
            if(!args["handled"])
                args.handled=false;
            if(this.def)
                this.def(args);
            for(var i=0;i<this.handlers.length;i++)
            {
                if(args.handled)
                    return;
                if(this.handlers[i])
                    this.handlers[i](args);
            }
        }

        /**
         * Add an event handler to this event.
         * @param {function} handler - The handler which handle the event.
         */
        Event.prototype.add=function(handler)
        {
            
            this.handlers.add(handler);
        }

        /**
         * Remove an event handler from this event.
         * @param {function} handler - The handler to be removed
         */
        Event.prototype.remove=function(handler)
        {
            if(this.def==handler)
                this.def=null;
            this.handlers.remove(handler);
        }
        
        /**
         * A event manager.
         */
        function EventManager()
        {
            this.events={};
            this.eventNames=ArrayList();
        }

        /** 
         */
        EventManager.prototype.register=function(name,event)
        {
            if(name==undefined || name==null)
                throw new Error("A name of the event required.");
            if(this.eventNames.indexOf(name)>0)
                throw new Error("Event existed.");
            this.events[name]=event;
            this.eventNames.add(name);
        }
        Event.EventManager=EventManager;
        
        /**
         * Define a event to an object.
         * @param {object} obj - The object that own the event.
         * @param {string} name - The name of the event.
         * @param {function} [handler] - Add a handler to this event after init.
         */
        function defineEvent(obj,name,handler)
        {
            if(!obj)
                throw new Error("An object required.");
            if(name==undefined || name==null)
                throw new Error("A name of the event required.");
            if(!obj.eventManager)
            {
                obj.eventManager=new EventManager();
                
            }
            
            if(obj.eventManager.eventNames.contain(name))
                throw new Error("Event existed.");
            var event=new Event();
            obj.eventManager.register(name);
            Object.defineProperty(obj,name,{
                get:function()
                {
                    return event;
                },
                set:function(handler)
                {
                    event.def=handler;
                }
            })
        }
        Event.defineEvent=defineEvent;
        return Event;
    })();

    return TMCS;

    /**
     * The callback that handles the result.
     * @callback resultCallback
     * @param {string} result - The result.
     * @return undefined
     */

    /**
     * The callback that handles the HTTP Response.
     * @callback responseCallback
     * @param {XMLHttpRequestResponseType} response - The HTTP Response.
     * @return undefined
     */
})();
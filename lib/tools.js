var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    return result;
  };
const Arweave = require("arweave/node");
const fs = require("jsonfile");
const smartweave = require("smartweave");
const axios = require("axios");
var Datastore = require("nedb"),
  
const ArweaveUtils = __importStar(require("arweave/node/lib/utils"));
const _ = require("lodash");
const arweave = Arweave.init({
  host: "arweave.net",
  protocol: "https",
  port: 443,
});

const koi_contract = "ONwLpiBN8bNLPIZllg4izU3wgXgtwYrJ4PZTwQNBJF0";
const bundlerNodes = "http://localhost:8887/submitVote/";

class koi {
  constructor() {
    this.wallet = {};
    this.myBookmarks = [];
    this.totalVoted = -1;
    this.reciepts = [];
    this.nodeState = {};
    this.contractAddress = koi_contract;
    console.log(
      "Initialized a Koi Node with the smart contract: " + koi_contract
    );
    // TODO - get some fancy ASCII art here
  }

  /*
    @addToBookMarks // add txid to bookmarks 
    artxid : String, // arweave transaction id
    ref: ................?  
  */
  addToBookmarks(artxid, ref) {
    if (typeof this.myBookmarks[artxid] != "undefined") {
      throw Error(
        "cannot assign a bookmark to ",
        artxid,
        " since it already has a note ",
        ref
      );
    } else {
      this.myBookmarks[artxid] = ref;
      this.myBookmarks[ref] = artxid;
    }
  }

  /*
    @loadWallet // loads wallet key from file path.
    Returns the key as an object.
    walletFileLocation: // wallet key file loaction
  */
  async loadWallet(walletFileLocation) {
    if (typeof walletFileLocation === "object") {
      this.wallet = walletFileLocation;
    } else {
      this.wallet = await loadFile(walletFileLocation);
    }
    db = new Datastore(database.db);
    db.loadDatabase();
    db.count({}, function (err, count) {
  if(count == 0){
     let data = {
      totalVoted : -1,
      reciept: []
    }
    db.insert(data);
  }
});

db.find({}, function(err, data){
  this.totalVoted = data.totalVoted
})    
    
    await this.getWalletAddress();

    return this.wallet;
  }

  /*
    @generateWallet // creates a wallet and loads it
    returns true on success, after which this.wallet will successfully resolve
  */
  async generateWallet() {
    let _this = this;
    return new Promise(function (resolve, reject) {
      arweave.wallets.generate().then(async (key) => {
        if (!key) reject("failed to create wallet");
        _this.wallet = key;
        await _this.getWalletAddress();
        if (_this.wallet) resolve(true);
        else reject("wallet not set");
      });
    });
  }

  /*
    @setWallet // set address .
    Returns address
    walletAddress: string // arweave address
  */
  async setWallet(walletAddress) {
    if (!this.address) this.address = walletAddress;
    return this.address;
  }

  /*
    @getWalletAddress // get walllet key address.
    Returns address as a string;
  */
  async getWalletAddress() {
    if (!this.address)
      this.address = await arweave.wallets.jwkToAddress(this.wallet);
    return this.address;
  }

  /*
    @getWalletBalance // gets wallet balance Note, this is arweave bakance, not kOI balance.
    Returns balance.
  */
  async getWalletBalance() {
    this.balance = await arweave.wallets.getBalance(this.address);
    return this.balance;
  }

  /*
   @getWalletBalance // gets wallet balance Note, this is arweave bakance, not kOI balance.
   Returns balance.
 */
  async getKoiBalance() {
    let state = await this.getContractState();
    if (!(this.address in state.balances)) {
      return 0;
    }
    let koiBalance = state.balances[this.address];
    return koiBalance;
  }

  /*
    @stake //  interact with contract to stake
    Returns the transaction id. 
    qty : integer, //  quantity to stake
   */
  async stake(qty) {
    if (!Number.isInteger(qty)) {
      throw Error('Invalid value for "qty". Must be an integer');
    }
    var input = {
      function: "stake",
      qty: qty,
    };

    let result = await this._interactWrite(input);
    return result;
  }

  /*
      @withDraw //  interact with contract to transfer koi 
      Returns the transaction id. 
      qty : integer, //  quantity to transfer
      target : string, //  reciever address 
    */
  async withDraw(qty) {
    if (!Number.isInteger(qty)) {
      throw Error('Invalid value for "qty". Must be an integer');
    }
    let input = {
      function: "withdraw",
      qty: qty,
    };

    let result = await this._interactWrite(input);

    return result;
  }

  /*
      @transfer //  interact with contract to transfer koi 
      Returns the transaction id. 
      qty : integer, //  quantity to transfer
      target : string, //  reciever address 
    */
  async transfer(qty, target) {
    let input = {
      function: "transfer",
      qty: qty,
      target: target,
    };

    let result = await this._interactWrite(input);

    return result;
  }

  /* @registerData //  interact with contract to register data
   Returns the transaction id. 
   param1 : txId, // it has batchFile/value(string) and stakeamount/value(int) as properties 
  */
  async registerData(txId, owner, arwallet, testArweave) {
    let input = {
      function: "registerData",
      txId: txId,
      owner: owner,
    };
    if (arwallet === {}) {
      arwallet = "use_wallet";
    }

    return new Promise(function (resolve, reject) {
      smartweave
        .interactWrite(testArweave, arwallet, koi_contract, input)
        .then((txId) => {
          resolve(txId);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  /*
     @vote //  submit vote to bundle server or direct to contract
     Returns the transaction id. 
     arg : Object, // it has direct(boolean),  voteId(string) and useVote(String)
    */
  async vote(arg) {
    let userVote = await this.validateData(arg.voteId);

    if (userVote == null) {
      this.totalVoted += 1;
      return { message: "VoteTimePassed" };
    }

    let input = {
      function: "vote",
      voteId: arg.voteId,
      userVote: userVote,
    };

    var reciept;
    var tx;
    if (arg.direct === true) {
      tx = await this._interactWrite(input);
    } else {
      let caller = await this.getWalletAddress();
      let userVoteBoolean = new Boolean(userVote);

      let userVoteString = userVoteBoolean.toString();

      input.userVote = userVoteString;
      let payload = {
        vote: input,
        senderAddress: caller,
      };

      reciept = await this._bundlerNode(payload);
    }
    if (tx) {
      this.totalVoted += 1;
      db.find({totalVoted}, {totalVoted: this.totalVoted})
      return tx;
    }

    if (reciept) {
      if (reciept.status == 200) {
        this.totalVoted += 1;
        db.find({totalVoted}, {totalVoted: this.totalVoted})
        let data = reciept.data.receipt;
        db.find({reciept}, { $push: { data } } )
        //this.reciepts.push(reciept.data.message);
        return { message: "success" };
      } else {
        this.totalVoted += 1;
        return { message: "duplicatedVote" };
      }
    }

    return null;
  }

  /*
      @submitTrafficLog //  propose a tafficlog for vote 
      Returns tx 
      arg// object arg.gateway(trafficlog orginal gateway id)
            and arg.stakeAmount(min required stake to vote) 
    */
  async submitTrafficLog(arg) {
    let TLTxId = await this._storeTrafficlogOnArweave(arg.gateWayUrl);

    let input = {
      function: "submitTrafficLog",
      gateWayUrl: arg.gateWayUrl,
      batchTxId: TLTxId,
      stakeAmount: arg.stakeAmount,
    };
    let tx = await this._interactWrite(input);

    return tx;
  }

  /*
  @rankProposal //  rank proposed trafficlogs
  Returns tx 
  */
  async rankProposal() {
    let input = {
      function: "rankProposal",
    };
    let tx = await this._interactWrite(input);

    return tx;
  }

  /*
   @batchAction // Interact with contract to add the votes 
   Returns the transaction id. 
    txId : String, // the votes transaction id in arweave
  */
  async batchAction(arg) {
    // input object that pass to contract
    let input = {
      function: "batchAction",
      batchFile: arg.batchFile,
      voteId: arg.voteId,
      bundlerAddress: arg.bundlerAddress,
    };

    // interact with contract function batchAction which adds all votes and update the state
    let result = await this._interactWrite(input);
    return result;
  }

  /*
   @proposeSlash //  propose a stake slashing 
  */
  async proposeSlash() {
    const state = await this.getContractState();
    const votes = state.votes;
    for (let i; i < this.reciepts.length - 1; i++) {
      let element = this.reciepts[i];
      let voteId = element.vote.vote.voteId;
      let vote = votes[voteId];
      if (!vote.voted.includes(this.wallet)) {
        let input = {
          function: "proposeSlash",
          reciept: element,
        };
        await this._interactWrite(input);
      }
    }

    return null;
  }

  /*
   @distributeDailyRewards //  interact with contract to distribute daily rewards
   Returns the transaction id. 
  */
  async distributeDailyRewards() {
    let input = {
      function: "distributeRewards",
    };
    let result = await this._interactWrite(input);
    return result;
  }

  /*
    @mint //  mint koi
    Returns tx 
    arg// object arg.targetAddress(reciever address) and arg.qty(amount to mint)
  */
  async mint(arg) {
    let input = {
      function: "mint",
      target: arg.targetAddress,
      qty: arg.qty,
    };

    let tx = await this._interactWrite(input);

    return tx;
  }

  /*
  @contentView// return an object with {totaltViews, totalReward, 24hrsViews}
  contentTxId : TxId of the content
  */

  async contentView(contentTxId, state) {
    // const state = await this.getContractState();
    // const path = "https://bundler.openkoi.com/state/current/";
    const rewardReport = _.get(
      state,
      "stateUpdate.trafficLogs.rewardReport",
      []
    );
    const nftState = await this.readNftState(contentTxId);

    let contentViews = {
      ...nftState,
      totalViews: 0,
      totalReward: 0,
      twentyFourHrViews: 0,
      txIdContent: contentTxId,
    };

    rewardReport.forEach((ele) => {
      let logSummary = ele.logsSummary;

      for (let txId in logSummary) {
        if (txId == contentTxId) {
          if (rewardReport.indexOf(ele) == rewardReport.length - 1) {
            contentViews.twentyFourHrViews = logSummary[contentTxId];
          }

          const rewardPerAttention = ele.rewardPerAttention;
          contentViews.totalViews += logSummary[contentTxId];
          const rewardPerLog = logSummary[contentTxId] * rewardPerAttention;
          contentViews.totalReward += rewardPerLog;
        }
      }
    });
    return contentViews;
  }
  /* returns the top contents registered in Koi in array */
  async retrieveTopContent() {
    const allContents = await this._retrieveAllContent();
    allContents.sort(function (a, b) {
      return b.totalViews - a.totalViews;
    });
    return allContents;
  }

  async _retrieveAllContent() {
    const state = await this.getContractState();
    const registerRecords = state.registeredRecord;
    let txIdArr = Object.keys(registerRecords);
    let contentViewPromises = txIdArr.map((txId) =>
      this.contentViewWrapper(txId, state)
    );
    let contents = await Promise.all(contentViewPromises);
    return contents;
  }

  /* contentViewWrapper that returns a promisified version*/
  contentViewWrapper(txId, state) {
    return new Promise((resolve, reject) => {
      this.contentView(txId, state)
        .then((value) => {
          resolve(value);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }

  /*
     @myContent: get top conetents 
     Returns: array of user contents
       
    */

  async myContent() {
    //const state = await this.getContractState();
    const path = "https://bundler.openkoi.com:8888/state/current/";
    const state = await getCacheData(path);

    const contents = [];
    const registerRecords = state.data.registeredRecord;
    for (let txId in registerRecords) {
      if (registerRecords[txId] == this.address) {
        let nftInfo = await this.contentView(txId, state);
        contents.push(nftInfo);
      }
    }

    return contents;
  }

  /*
  return top contets from catched data in server
   */
  async getTopContent() {
    const path = "https://bundler.openkoi.com:8888/state/getTopContent/";
    const topContents = await getCacheData(path);
    return topContents;
  }
  /* nDay = number days it could be weekly or monthly for top contents
return contents with top views
 */
  async nDaysTopContent(nDay) {
    const path = "https://bundler.openkoi.com:8888/state/current/";
    const state = await getCacheData(path);
    const rewardReport = state.data.stateUpdate.trafficLogs.rewardReport;

    const contents = [];
    let index = rewardReport.length - nDay;

    if (index >= 0) {
      for (let i = index; i < rewardReport.length; i++) {
        let logSummary = rewardReport[i].logsSummary;
        let rewardPerAttention = rewardReport[i].rewardPerAttention;
        for (let txId in logSummary) {
          let contentViews = {
            totalViews: 0,
            totalReward: 0,
            txId: "",
          };
          contentViews.txId = txId;
          contentViews.totalViews += logSummary[txId];
          const rewardPerLog = logSummary[txId] * rewardPerAttention;
          contentViews.totalReward += rewardPerLog;
          contents.push(contentViews);
        }
      }
      contents.sort(function (a, b) {
        return b.totalViews - a.totalViews;
      });
      return contents;
    }
  }

  /* .....*/
  async nftTransactionData(txId) {
    const state = await arweave.transactions.get(txId);
    return state;
  }
  /*
     @signPayload: sign payload
     return: signed payload with signature.
       payload to sign
    */
  async signPayload(payload) {
    let jwk = this.wallet;
    let publicModulus = jwk.n;
    const dataInString = JSON.stringify(payload.vote);
    const dataIn8Array = ArweaveUtils.stringToBuffer(dataInString);
    const rawSignature = await arweave.crypto.sign(jwk, dataIn8Array);
    payload.signature = ArweaveUtils.bufferTob64Url(rawSignature);
    payload.owner = publicModulus;
    return payload;
  }

  /*
    @verifySignature //  verify signed payload
    Returns boolean. // 
    payload : object, //  payload 
    
  */
  async verifySignature(payload) {
    const rawSignature = ArweaveUtils.b64UrlToBuffer(payload.signature);
    const dataInString = JSON.stringify(payload.vote);
    const dataIn8Array = ArweaveUtils.stringToBuffer(dataInString);
    const valid = await arweave.crypto.verify(
      payload.owner,
      dataIn8Array,
      rawSignature
    );
    return valid;
  }

  //----------------------------------------------------------------------------------------------------------------------------------
  /*
       @getContractState //  returns current KOI system state
      Returns state object
    */
  async getContractState() {
    let state = await this._readContract();
    return state;
  }

  /*
  @getTransaction //  get contract state
  Returns state object
  */
  async getTransaction(id) {
    let transaction = await arweave.transactions.get(id);
    return transaction;
  }

  /*
  @etBlockheight //  get current blockheight 
  Returns int// block height
  */
  async getBlockheight() {
    let info = await getArweavenetInfo();

    return info.data.height;
  }

  //--------------------------------------------------------------------------------------------------------------------------------------
  /*
 @_interactWrite //  internal function, writes to contract
 Returns the a promise
 input: // Object, passes to smartweave write function, in order to excute a contract function.
*/
  async _interactWrite(input) {
    let wallet;
    if (this.wallet !== {}) {
      wallet = this.wallet;
    } else {
      wallet = "use_wallet";
    }

    return new Promise(function (resolve, reject) {
      smartweave
        .interactWrite(arweave, wallet, koi_contract, input)
        .then((txId) => {
          resolve(txId);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  /*
   @_readContract //  internal function, read contract latest state
   Returns the a promise
 */
  async _readContract() {
    return new Promise(function (resolve, reject) {
      smartweave
        .readContract(arweave, koi_contract)
        .then((state) => {
          resolve(state);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  /*
   @_readContract //  internal function, read contract latest state
   Returns the a promise
 */
  async _hashData(data) {
    const dataInString = JSON.stringify(data);
    const dataIn8Array = ArweaveUtils.stringToBuffer(dataInString);
    const hashBuffer = await arweave.crypto.hash(dataIn8Array);
    const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""); // convert bytes to hex string
    return hashHex;
  }

  /*nftReadState function */

  async readNftState(txId) {
    const state = await smartweave.readContract(arweave, txId);
    return state;
  }

  /*
    @_bundlerNode // internal function, submits a payload to server 
    Returns the result as a promise
    payload: // a payload to be submited. 
   */
  async _bundlerNode(payload) {
    payload = await this.signPayload(payload);

    return new Promise(function (resolve) {
      axios
        .post(bundlerNodes, payload)
        .then((res) => {
          resolve(res);
        })
        .catch((error) => {
          resolve(error);
        });
    });
  }

  /*
    @ _getTrafficLogFromGateWay // get trafficllogs from gateway 
    Returns the result as a promise
    path: // a gateway url 
   */
  async _getTrafficLogFromGateWay(path) {
    return new Promise(function (resolve, reject) {
      axios
        .get(path)
        .then((res) => {
          resolve(res);
        })
        .catch((error) => {
          reject(error);
        });
    });
  }

  /*
    @_storeTrafficlogOnArweave // submit trafficlog to arweave 
    Returns: // tx id
    gatewayUrl: // a gateway url 
   */
  async _storeTrafficlogOnArweave(gateWayUrl) {
    let trafficLogs = await this._getTrafficLogFromGateWay(gateWayUrl);

    let tx = await this.postData(trafficLogs.data.summary);

    return tx;
  }

  /*
    @validateData // validate trafficlog by comparing trafficlog from gateway and arweave storage 
    Returns boolean:// 
   voteId: // vote id which is belongs for specific proposalLog
   */
  async validateData(voteId) {
    const state = await this.getContractState();
    const trafficLogs = state.stateUpdate.trafficLogs;
    const currentTrafficLogs = trafficLogs.dailyTrafficLog.find(
      (trafficlog) => trafficlog.block === trafficLogs.open
    );
    const proposedLogs = currentTrafficLogs.proposedLogs;
    let proposedLog = null;
    proposedLogs.forEach((element) => {
      if (element.voteId === voteId) {
        proposedLog = element;
      }
    });
    // lets assume we have one gateway id for now.
    //let gateWayUrl = proposedLog.gatWayId;

    if (proposedLog === null) {
      return null;
    }
    let gatewayTrafficLogs = await this._getTrafficLogFromGateWay(
      "https://arweave.dev/logs"
    );
    let gatewayTrafficLogsHash = await this._hashData(
      gatewayTrafficLogs.data.summary
    );

    let bundledTrafficLogs = await arweave.transactions.getData(
      proposedLog.TLTxId,
      { decode: true, string: true }
    );

    const bundledTrafficLogsParsed = JSON.parse(bundledTrafficLogs);
    let bundledTrafficLogsParsedHash = await this._hashData(
      bundledTrafficLogsParsed
    );
    let isValid = gatewayTrafficLogsHash === bundledTrafficLogsParsedHash;

    return isValid;
  }

  /*
      @postData // posts data on arweave.
      Returns transaction id.
      data: object // data
    */
  async postData(data) {
    // TODO: define data interface
    let wallet = this.wallet;

    const transaction = await arweave.createTransaction(
      {
        // eslint-disable-next-line no-undef
        data: Buffer.from(JSON.stringify(data, null, 2), "utf8"),
      },
      wallet
    );

    // Now we sign the transaction
    await arweave.transactions.sign(transaction, wallet);
    let txId = transaction.id;

    // After is signed, we send the transaction
    var response = await arweave.transactions.post(transaction);

    if (response.status === 200) {
      return txId;
    }

    return null;
  }
}

module.exports = koi;

async function loadFile(fileName) {
  return new Promise(function (resolve, reject) {
    fs.readFile(fileName)
      .then((file) => {
        resolve(file);
      })
      .catch((err) => {
        reject(err);
      });
  });
}

async function getArweavenetInfo() {
  return new Promise(function (resolve, reject) {
    axios
      .get("https://arweave.net/info")
      .then((res) => {
        resolve(res);
      })
      .catch((error) => {
        reject(error);
      });
  });
}

async function getCacheData(path) {
  return new Promise(function (resolve, reject) {
    axios
      .get(path)
      .then((res) => {
        resolve(res);
      })
      .catch((error) => {
        reject(error);
      });
  });
}

/*
async function getArweavenetInfo() {
  return new Promise(function (resolve, reject) {
    axios
      .get("https://arweave.net/info")
      .then((res) => {
        resolve(res);
      })
      .catch((error) => {
        reject(error);
      });
  });
}
async function getCacheData(path) {
  return new Promise(function (resolve, reject) {
    axios
      .get(path)
      .then((res) => {
        resolve(res);
      })
      .catch((error) => {
        reject(error);
      });
  });
}
/*
runNode() {
  1. set wallet
  2. set stake (it not already set)
  3. check traffic logs
  4. submit vote
  5. verify vote was added to arweave (after 24 hrs)
}
*/

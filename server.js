const WebSocket = require("ws");
const express = require("express");

const app = express();
app.use(express.static("public"));

const PORT = process.env.PORT || 10000;

// ===== CONFIG =====
const API_TOKEN = "PASTE_YOUR_TOKEN_HERE"; // 🔴 REQUIRED
const markets = ["R_10","R_25","R_50","R_75","R_100"];

let dataStore = {};
let performance = { trades:0, wins:0, losses:0 };
let logs = [];

markets.forEach(m => dataStore[m] = []);

const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");

ws.on("open", () => {
    console.log("Connected to Deriv");

    ws.send(JSON.stringify({ authorize: API_TOKEN }));

    markets.forEach(m => {
        ws.send(JSON.stringify({ ticks: m }));
    });
});

ws.on("message", (msg) => {
    let data = JSON.parse(msg);

    if(data.tick){
        let market = data.tick.symbol;
        let digit = parseInt(data.tick.quote.toString().slice(-1));

        update(market, digit);
    }

    if(data.buy){
        log("Trade executed ✅");
    }
});

function update(m, d){
    let arr = dataStore[m];

    if(arr.length > 100) arr.shift();
    arr.push(d);

    analyze(m);
}

function analyze(m){
    let arr = dataStore[m];
    if(arr.length < 50) return;

    let even = arr.filter(x=>x%2===0).length;
    let odd = arr.length-even;

    let over = arr.filter(x=>x>=5).length;
    let under = arr.length-over;

    let confidence = 0;
    let strategy = "";

    if(even > odd){
        strategy = "EVEN";
        confidence = even / arr.length;
    } else {
        strategy = "ODD";
        confidence = odd / arr.length;
    }

    if(over/arr.length > confidence){
        strategy = "OVER";
        confidence = over / arr.length;
    }

    if(under/arr.length > confidence){
        strategy = "UNDER";
        confidence = under / arr.length;
    }

    if(confidence > 0.62){
        execute(m, strategy);
    }
}

function execute(market, strategy){

    const map = {
        EVEN:"DIGITEVEN",
        ODD:"DIGITODD",
        OVER:"DIGITOVER",
        UNDER:"DIGITUNDER"
    };

    let contract = map[strategy];

    let proposal = {
        buy:1,
        price:1,
        parameters:{
            amount:1,
            basis:"stake",
            contract_type:contract,
            currency:"USD",
            duration:1,
            duration_unit:"t",
            symbol:market
        }
    };

    ws.send(JSON.stringify(proposal));

    performance.trades++;
    log(`Trade: ${strategy} on ${market}`);
}

function log(msg){
    logs.unshift(msg);
    if(logs.length > 50) logs.pop();
}

// ===== API FOR DASHBOARD =====
app.get("/data", (req,res)=>{
    res.json({
        performance,
        logs
    });
});

app.listen(PORT, ()=>{
    console.log("Server running on port", PORT);
});
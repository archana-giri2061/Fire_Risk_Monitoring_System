//Import necessary libaries
/**
 * Express= node.js web framework which is used to create APIs, handle routes
 * process requets and send responses
 * 
 * dotenv= load environment variables from .env file automatically
 * 
 */
import express from "express";
import "dotenv/config";
import { weatherRouter } from "./routes/weather.routes";

export const app = express();
const port = Number(process.env.PORT);
/*
JSON= Data exchange between client and Server
Frontend sends JSON- Backend reads JSON
Backend sends JSON - frontend displays data 
*/
app.use(express.json());

app.get("/Check", (_, res) => res.json({ "Details": "Everything is Good!!" }));
app.use("/api/weather", weatherRouter)
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
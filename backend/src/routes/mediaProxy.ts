
import { Router } from "express";
import { Readable } from "stream";
import { verifyToken } from "../utils/token.js";
import { ENV } from "../config/env.js";

// we use it(this file) to avoid the brosers cors error
// without it the normal flow is:
// Frontend browser → signed S3 URL → S3
// with it -> proxy flow:
// Frontend browser → your Express backend → signed S3 URL → S3

// hence you can say that this file :
// lets the frontend download an image through your own backend instead of downloading it directly from S3.



// import { Readable } from "stream";=>
//  node has smthing like streams => means Don't load the whole file into memory.
// load the files in chucks .. like receive a small chucks => send them imdetelally and reveive next amd so on 


// import { Readable } from "stream";->nodejs imported the node streams
// the thing is that  the s3 send the file as a web stream but express expert a node stream
// so we convert the converts the S3/fetch stream into a Node-readable stream.
const router = Router();//create a router instance

// Proxies a signed S3 URL through our own server so the browser's fetch()
// call is same-origin (talks to us, not S3 directly) and never hits a CORS
// wall — regardless of what CORS config the bucket does or doesn't have.
router.get("/download", async (req, res) => {
  try {
    const token = req.cookies?.delina_token; // get the token from cookis
    if (!token) return res.status(401).json({ error: "Not authenticated." });
    // if token dont exit then not autherized
    try {
      verifyToken(token);// verify the token
    } catch {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    const url = req.query.url as string;// read the url query parameter from the requeest
    // the url is of the image to be downloaded
    if (!url) return res.status(400).json({ error: "Missing url." });//if no then the url is missing 

    let parsed: URL;//create an object that create the parsed url
    try {
      parsed = new URL(url);
      // instead of treating it as a  plain text 
      // node convert url into protocol, hostname , pathname , search
      // as we need to inspect the host name below so therefor we used it
      //new URL(url) checks whether the supplied string is a valid URL.
    } catch {
      return res.status(400).json({ error: "Invalid url." });// otherwise error
    }

    // if valid url it produces an object 
    // that contain the protocol: "https:",hostname: "gp-bucket-001.s3.ap-south-1.amazonaws.com",
    // and  pathname: "/whispr/images/a.jpg"

    // Builds the one S3 hostname that this proxy is allowed to fetch from.
    // so the host name will be kind of gp-bucket-001.s3.ap-south-1.amazonaws.com
    const allowedHost = `${ENV.AWS_BUCKET_NAME}.s3.${ENV.AWS_REGION}.amazonaws.com`;
    if (parsed.hostname !== allowedHost) {//security check
      return res.status(400).json({ error: "URL not allowed." });// if url is not equal to host name then error
    }


    // means->“Backend, go to this S3 URL and get the file for me
    // magine upstream as an S3 reply package:
    const upstream = await fetch(url);//Your backend now fetches the signed S3 URL.
    if (!upstream.ok || !upstream.body) {
        // Checks whether S3 returned a successful response and a file body.
        //upstream.ok is true for successful status codes such as 200.
        // upstream.body contains the actual image/audio bytes.
      return res.status(502).json({ error: "Could not fetch the file." });
    }

    // Now S3 successfully sent the file. Your backend needs to tell the browser what kind of file it is
    res.setHeader(//Copies the file’s content type from S3 to the browser.
      "Content-Type",// get the content type and if not then return it as a generic so we are just telling the  broswer
      upstream.headers.get("content-type") || "application/octet-stream"
    );

    // This helps the browser understand what kind of file it is downloading.
   
    const filename = (req.query.filename as string) || "download";
     //Do not just show this file in the page. Download it.
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);


    // This is the actual file transfer.
    // S3 response stream
    // → converted to Node stream
    // → piped into Express response
    // → browser receives the downloaded file
    // converts S3’s file-data format into a Node.js stream format that Express understands.
    // think of stream like Sending a file little by little, instead of loading the whole file at once.”
    //pipe(res)->Send those file pieces into the response going back to the browser.”
    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch (err) {
    console.error("Media proxy error:", err);
    res.status(500).json({ error: "Download failed." });
  }
});

export default router;



// fetch(url)
// → backend gets file from S3

// check upstream.ok and upstream.body
// → make sure S3 actually sent a valid file

// set Content-Type
// → tell browser whether it is JPG, PNG, WebM, etc.

// set Content-Disposition
// → tell browser to download it with a filename

// pipe(res)
// → send the actual file from backend to browser
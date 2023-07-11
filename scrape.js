require("dotenv").config();
const { MongoClient } = require("mongodb");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

async function addToDb(data) {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);

  try {
    await client.connect();

    const collection = client
      .db(process.env.MONGODB_DBNAME)
      .collection(process.env.MONGODB_COLLECTIONNAME);
    const result = await collection.insertMany(data);

    console.log(`Inserted ${result.insertedCount} documents into MongoDB`);
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

async function scrapeWebsite() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({ headless: true });

  console.log("Browser launched!");
  const page = await browser.newPage();

  console.log("Going to base page...");
  await page.goto("https://www.mql5.com/", { waitUntil: "domcontentloaded" });
  console.log("On base page");

  console.log("Navigating to login page...");
  await page.goto("https://www.mql5.com/en/auth_login", {
    waitUntil: "domcontentloaded",
  });
  console.log("On login page");

  // login
  await page.waitForSelector("#Login");
  await page.type("#Login", process.env.MQL5_USERNAME);
  await page.type("#Password", process.env.MQL5_PASSWORD);
  await page.click("#loginSubmit");

  console.log("Logged in successfully!");

  // wait for navigation to complete
  await page.waitForNavigation({ waitUntil: "domcontentloaded" });

  // go to the page to scrape
  await page.goto("https://www.mql5.com/en/users/taherhalimi/feedbacks", {
    waitUntil: "domcontentloaded",
  });

  // perform your scraping here...
  // after navigating to the page with the reviews...

  console.log("Extracting reviews...");
  const data = await page.evaluate(() => {
    const reviewElements = document.querySelectorAll(".rowLine"); // select each review element
    let reviews = []; // this array will hold each review

    reviewElements.forEach((reviewElement) => {
      let review = {};

      // Extract the rating
      const ratingElement = reviewElement.querySelector(
        ".rating-block-small__value"
      );
      if (ratingElement) {
        // count the number of <i> tags within the rating element
        let rating = ratingElement.getElementsByTagName("i").length;
        review.rating = rating;
      }

      // Extract the customer's name
      const nameElement = reviewElement.querySelector(".author");
      if (nameElement) {
        review.name = nameElement.innerText;
      }

      // Extract the review message
      const messageElements = reviewElement.querySelectorAll(
        ".mainContainer > span"
      );
      if (messageElements.length > 2) {
        review.message = messageElements[2].innerText;
      }

      reviews.push(review);
    });

    return reviews;
  });

  await browser.close();

  return data;
}

exports.handler = async function (event) {
  console.log("Received event: " + event);

  try {
    const data = await scrapeWebsite();
    console.log(data);
    await addToDb(data);
    return {
      statusCode: 200,
      body: "Scrape and data insert successful!",
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: "An error occurred",
    };
  }
};

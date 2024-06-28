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
    const options = { upsert: true }; // Enable upsert operation

    let addedCount = 0; // This is your counter

    for (const item of data) {
      // Specify the unique identifier for each item in your data
      const filter = {
        name: item.name,
        message: item.message,
        date: item.date,
      };
      // Update the document if it exists, or insert it if it doesn't exist
      const result = await collection.updateOne(
        filter,
        { $set: item },
        options
      );
      if (result.upsertedCount > 0) {
        console.log("Added new item:", item);
        addedCount++; // Increment the counter if a new item was added
      } else {
        console.log("Item already exists:", item);
      }
    }

    console.log(`Total new items added: ${addedCount}`); // Print the counter
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

function getLastPageNumber() {
  const paginatorElement = document.querySelector(".paginatorEx");
  const lastPageLink = paginatorElement.querySelector("a:last-child");
  const lastPageUrl = lastPageLink.getAttribute("href");
  const lastPageNumber = lastPageUrl.match(/page(\d+)/)[1];
  return parseInt(lastPageNumber);
}

async function scrapeWebsite(latestReviewDate) {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_EXECUTABLE_PATH,
    args: ["--no-sandbox"],
  });

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
  const lastPageNumber = await page.evaluate(getLastPageNumber);

  // Scrape all pages
  const data = [];
  for (let currentPage = 1; currentPage <= lastPageNumber; currentPage++) {
    console.log(`Scraping page ${currentPage} of ${lastPageNumber}`);

    // Go to the page to scrape
    await page.goto(
      `https://www.mql5.com/en/users/taherhalimi/feedbacks/page${currentPage}`,
      { waitUntil: "domcontentloaded" }
    );

    // Extract reviews from the current page
    const pageData = await page.evaluate(() => {
      const reviewElements = document.querySelectorAll(".rowLine");
      const reviews = [];

      reviewElements.forEach((reviewElement) => {
        const review = {};

        const ratingElement = reviewElement.querySelector(
          ".rating-block-small__value"
        );
        if (ratingElement) {
          const rating = ratingElement.getElementsByTagName("i").length;
          review.rating = rating;
        }

        const nameElement = reviewElement.querySelector(".author");
        if (nameElement) {
          review.name = nameElement.innerText;
        }

        const messageElements = reviewElement.querySelectorAll(
          ".mainContainer > span"
        );
        if (messageElements.length > 2) {
          review.message = messageElements[2].innerText;
        }

        const dateElement = reviewElement.querySelector(".dateContainer");
        if (dateElement) {
          const isoDateString = dateElement.innerText.split(".").join("-");
          review.date = isoDateString;
        }

        reviews.push(review);
      });

      return reviews;
    });

    for (const review of pageData) {
      if (new Date(review.date) <= new Date(latestReviewDate)) {
        console.log("Encountered existing review, stopping scraping.");
        stopScraping = true;
        break;
      }
      data.push(review);
    }
  }

  await browser.close();

  return data;
}

async function getLastReviewDate() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const collection = client
      .db(process.env.MONGODB_DBNAME)
      .collection(process.env.MONGODB_COLLECTIONNAME);

    const latestReview = await collection
      .find({})
      .sort({ date: -1 })
      .limit(1)
      .toArray();

    if (latestReview.length > 0) {
      return latestReview[0].date;
    } else {
      return null;
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

async function runScraping() {
  console.time("Execution time"); // Start the timer
  console.log("Running scraper...");

  try {
    const latestReviewDate = await getLastReviewDate();
    console.log("Latest review date:", latestReviewDate);
    const data = await scrapeWebsite(latestReviewDate);
    console.log(data);
    await addToDb(data);
    console.log("Scrape and data insert succesful !");
  } catch (err) {
    console.error(err);
    console.log("An error occured.");
  } finally {
    console.timeEnd("Execution time"); // End the timer
  }
}

runScraping();

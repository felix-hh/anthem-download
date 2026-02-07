const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

async function main() {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }

  console.log('Connecting to Brave...');

  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
  } catch (err) {
    console.error('Failed to connect! Run ./start-brave.sh first');
    process.exit(1);
  }

  console.log('Connected!');

  const contexts = browser.contexts();
  const pages = contexts.flatMap(c => c.pages());
  let page = pages.find(p => p.url().includes('eob-center/medical'));

  if (!page) {
    page = pages.find(p => p.url().includes('anthem.com') && !p.url().includes('blob:'));
  }

  if (!page) {
    console.error('No Anthem EOB page found!');
    process.exit(1);
  }

  console.log(`Using: ${page.url()}`);
  console.log('\nScraping EOB entries...');
  await page.waitForTimeout(2000);

  // Scrape EOB data
  const eobData = await page.evaluate(() => {
    const rows = document.querySelectorAll('div[role="row"].tcp-row-wrapper-zebra');
    const entries = [];

    rows.forEach((row, index) => {
      const cells = row.querySelectorAll('div[role="cell"]');
      if (cells.length >= 7) {
        const serviceDateCell = cells[1].querySelector('span:not(.tcp-sm-screen-label)');
        const serviceDate = serviceDateCell ? serviceDateCell.textContent.trim() : '';

        const providerCell = cells[4].querySelector('li.eob-center-block');
        const provider = providerCell ? providerCell.textContent.trim() : '';

        const downloadBtn = row.querySelector('button[id^="tcp-eobcenter-download-link-"]');
        const buttonId = downloadBtn ? downloadBtn.id : null;

        if (buttonId) {
          entries.push({ index, serviceDate, provider, buttonId });
        }
      }
    });

    return entries;
  });

  console.log(`Found ${eobData.length} EOB entries.\n`);

  // Process each EOB
  for (let i = 0; i < eobData.length; i++) {
    const eob = eobData[i];

    // Format filename
    const dateParts = eob.serviceDate.split('/');
    let formattedDate = eob.serviceDate;
    if (dateParts.length === 3) {
      const [month, day, year] = dateParts;
      formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const cleanProvider = eob.provider
      .replace(/[<>:"/\\|?*()]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 40);

    const targetFilename = `${formattedDate}_EOB_${cleanProvider}.pdf`;
    console.log(`[${i + 1}/${eobData.length}] ${targetFilename}`);

    try {
      // Start waiting for download BEFORE clicking
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });

      // Click the button
      await page.click(`#${eob.buttonId}`);
      console.log('  Clicked. Waiting for download event...');

      // Wait for the download to start
      const download = await downloadPromise;
      console.log(`  Download started: ${download.suggestedFilename()}`);

      // Save to our folder with our filename
      let destPath = path.join(DOWNLOADS_DIR, targetFilename);
      let counter = 1;
      while (fs.existsSync(destPath)) {
        destPath = path.join(DOWNLOADS_DIR, `${formattedDate}_EOB_${cleanProvider}_${counter}.pdf`);
        counter++;
      }

      await download.saveAs(destPath);
      const stats = fs.statSync(destPath);
      console.log(`  ✓ ${path.basename(destPath)} (${(stats.size / 1024).toFixed(0)} KB)`);

      // Wait before next
      await page.waitForTimeout(2000);

    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Done! Files in:', DOWNLOADS_DIR);
  const finalFiles = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.endsWith('.pdf'));
  console.log(`Total: ${finalFiles.length} PDFs`);
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

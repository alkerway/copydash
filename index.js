const convert = require("xml-js");
const fs = require("fs");
const { download } = require("./download");

const outputDir = "output";

const mpdFileName = process.argv[2];
const remoteMappings = [];

const mpdContents = fs.readFileSync(mpdFileName, "utf8");
const manifest = JSON.parse(convert.xml2json(mpdContents));

const periods = manifest.elements[0].elements;
const numPeriods = periods.length;

for (let periodIndex = 0; periodIndex < numPeriods; periodIndex++) {
  const adaptationSets = periods[periodIndex].elements.filter(
    (element) =>
      element.name === "AdaptationSet" &&
      ["video/mp4", "audio/mp4"].includes(element.attributes.mimeType)
  );

  for (const eachSet of adaptationSets) {
    const adaptationSet = eachSet.elements;
    const initTemplate = adaptationSet.find(
      (element) => element.name === "SegmentTemplate"
    );
    const startNumber = Number(initTemplate.attributes.startNumber);

    const numSegments = initTemplate.elements
      .find((element) => element.name === "SegmentTimeline")
      .elements.reduce(
        (total, element) =>
          total + (element.attributes.r ? Number(element.attributes.r) : 1),
        0
      );

    const representations = adaptationSet.filter(
      (element) => element.name === "Representation"
    );
    for (representation of representations) {
      const initRemoteUrl = initTemplate.attributes.initialization.replace(
        /\$RepresentationID\$/,
        representation.attributes.id
      );
      const initLocalPath = `${outputDir}/periods/${periodIndex}/${representation.attributes.id}/init0.m4f`;
      remoteMappings.push({
        remote: initRemoteUrl,
        path: initLocalPath,
        period: periodIndex,
      });
      for (
        let segmentNumber = startNumber;
        segmentNumber <= startNumber + numSegments + 2;
        segmentNumber++
      ) {
        const remoteUrl = initTemplate.attributes.media
          .replace(/\$RepresentationID\$/, representation.attributes.id)
          .replace(/\$Number\$/, segmentNumber);
        remoteMappings.push({
          period: periodIndex,
          remote: remoteUrl,
          path: `${outputDir}/periods/${periodIndex}/${representation.attributes.id}/segment${segmentNumber}.m4f`,
        });
      }
    }
    initTemplate.attributes.initialization = `${outputDir}/periods/${periodIndex}/$RepresentationID$/init0.m4f`;
    initTemplate.attributes.media = `${outputDir}/periods/${periodIndex}/$RepresentationID$/segment$Number$.m4f`;
  }
}

class DownloadQueue {
  maxDownloads = 10;
  numDownloads = 0;
  items;
  onQueueComplete;

  constructor(items, onQueueComplete) {
    this.items = items;
    this.onQueueComplete = onQueueComplete;
    for (let i = 0; i < this.maxDownloads; i++) {
      if (this.items.length) {
        this.startOneDownload(this.items.shift());
      }
    }
  }

  startOneDownload = (item) => {
    console.log(
      `Downloading period ${item.period + 1}/${numPeriods} ${item.path}`
    );
    this.numDownloads += 1;
    download(item.remote, item.path)
      .then(this.oneDownloadFinished)
      .catch((err) => {
        console.warn("Error downloading", item.path, item.period, err);
      });
  };

  oneDownloadFinished = () => {
    this.numDownloads -= 1;
    if (this.items.length) {
      this.startOneDownload(this.items.shift());
    } else if (this.numDownloads === 0) {
      this.onQueueComplete();
    }
  };
}

const onComplete = () => {
  console.log("Downloads done");
  const modifiedMpd = convert.json2xml(JSON.stringify(manifest), { spaces: 2 });
  fs.writeFileSync(`${outputDir}/manifest.mpd`, modifiedMpd);
};
new DownloadQueue(remoteMappings, onComplete);

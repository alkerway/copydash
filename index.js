const convert = require("xml-js");
const fs = require("fs");
const { download } = require("./download");

const mpdFileName = process.argv[2];
const replaceMappings = [];
const remoteMappings = [];

const xml = fs.readFileSync(mpdFileName, "utf8");
const manifest = JSON.parse(convert.xml2json(xml));

const periodIndex = 0;
const periods = manifest.elements[periodIndex].elements;

const adaptationSets = periods[periodIndex].elements.filter(
  (element) =>
    element.name === "AdaptationSet" &&
    ["video/mp4", "audio/mp4"].includes(element.attributes.mimeType)
);

const adaptationIndex = 0;

const adaptationSet = adaptationSets[adaptationIndex].elements;
const initTemplate = adaptationSet.find(
  (element) => element.name === "SegmentTemplate"
);
const startNumber = Number(initTemplate.attributes.startNumber);
const numSegments = initTemplate.elements
  .find((element) => element.name === "SegmentTimeline")
  .elements.filter((element) => element.attributes.r)
  .reduce((total, element) => total + Number(element.attributes.r), 0);

replaceMappings.push({
  old: initTemplate.attributes.initialization,
  new: `periods/${periodIndex}/$RepresentationID$/init0.m4f`,
});
replaceMappings.push({
  old: initTemplate.attributes.media,
  new: `periods/${periodIndex}/$RepresentationID$/segment$Number$.m4f`,
});

const representations = adaptationSet.filter(
  (element) => element.name === "Representation"
);
for (representation of representations) {
  // const representationIndex = 0;
  // const representation = representations[representationIndex];
  const initRemoteUrl = initTemplate.attributes.initialization.replace(
    /\$RepresentationID\$/,
    representation.attributes.id
  );
  const initLocalPath = `periods/${periodIndex}/${representation.attributes.id}/init0.m4f`;
  remoteMappings.push({
    remote: initRemoteUrl,
    path: initLocalPath,
    period: periodIndex,
  });
  for (
    let segmentNumber = startNumber;
    segmentNumber <= startNumber + numSegments;
    segmentNumber++
  ) {
    const remoteUrl = initTemplate.attributes.media
      .replace(/\$RepresentationID\$/, representation.attributes.id)
      .replace(/\$Number\$/, segmentNumber);
    remoteMappings.push({
      period: periodIndex,
      remote: remoteUrl,
      path: `periods/${periodIndex}/${representation.attributes.id}/segment${segmentNumber}.m4f`,
    });
  }
}

class DownloadQueue {
  maxDownloads = 5;
  items;

  constructor(items) {
    this.items = items;
  }

  init = () => {
    for (let i = 0; i < this.maxDownloads; i++) {
      if (this.items.length) {
        this.start(this.items.shift());
      }
    }
  };

  start = (item) => {
    console.log(`Downloading period ${item.period} ${item.path}`);
    download(item.remote, item.path)
      .then(this.onFinish)
      .catch((err) => {
        console.warn("Error downloading", item.path, item.period);
      });
  };

  onFinish = () => {
    if (this.items.length) {
      this.start(this.items.shift());
    }
  };
}

const queue = new DownloadQueue(remoteMappings);
queue.init();

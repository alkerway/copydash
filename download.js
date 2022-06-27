const request = require("request");
const fs = require("fs");

module.exports = {
  download: (remoteUrl, localPath) => {
    return new Promise((resolve, reject) => {
      const dirName = localPath.split("/").slice(0, -1).join("/");
      if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName, { recursive: true });
      }
      const file = fs.createWriteStream(localPath);
      const sendReq = request.get(remoteUrl);

      // verify response code
      sendReq.on("response", (response) => {
        if (response.statusCode !== 200) {
          console.warn(
            "response code on download",
            localPath,
            response.statusCode
          );
        }

        sendReq.pipe(file);
      });

      file.on("finish", () => file.close(() => resolve()));

      sendReq.on("error", (err) => {
        fs.unlink(dest, () => reject(err.message));
      });

      file.on("error", (err) => {
        fs.unlink(dest, () => reject(err.message));
      });
    });
  },
};

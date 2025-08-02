const path = require("path");
const { getImageFiles } = require("../app/utils/fileHelpers");
const fs = require("fs/promises");

const testMediaDir = path.join(__dirname, "test-media");

beforeAll(async () => {
  await fs.mkdir(testMediaDir, { recursive: true });
  await fs.writeFile(path.join(testMediaDir, "image.jpg"), "dummy content");
  await fs.writeFile(path.join(testMediaDir, "doc.txt"), "not an image");
});

afterAll(async () => {
  await fs.rm(testMediaDir, { recursive: true, force: true });
});

test("should return only image files", async () => {
  const images = await getImageFiles(testMediaDir);
  expect(images).toContain("image.jpg");
  expect(images).not.toContain("doc.txt");
});

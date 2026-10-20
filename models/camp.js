const mongoose = require("mongoose");
const Review = require("./review");
const Schema = mongoose.Schema;

const ImageSchema = new Schema({
  url: String,
  filename: String,
  // What the photo shows. Set for the sample photos; uploads have none.
  alt: { type: String, trim: true, maxlength: 200 },
});

const CampSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    images: [ImageSchema],
    geometry: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    price: { type: Number, required: true, min: 0, max: 1000 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    location: { type: String, required: true, trim: true, maxlength: 120 },
    // Sample listings (seeded, invented). Never settable from a form.
    isDemo: { type: Boolean, default: false },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    reviews: [
      {
        type: Schema.Types.ObjectId,
        ref: "Review",
      },
    ],
  },
  { timestamps: true },
);

CampSchema.post("findOneAndDelete", async function (doc) {
  if (doc) {
    await Review.deleteMany({
      _id: {
        $in: doc.reviews,
      },
    });
  }
});

module.exports = mongoose.model("Camp", CampSchema);

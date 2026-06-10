const Camp = require("../models/camp");
const { fileToImage, destroyImage } = require("../cloudinary");
const geocodeNZ = require("../utils/geocode");

module.exports.index = async (req, res) => {
  try {
    const camps = await Camp.find({})
      .populate({ path: "reviews", populate: { path: "author" } })
      .populate("author");
    res.render("camps/index", { camps });
  } catch (error) {
    req.flash("error", "Error fetching camps: " + error.message);
    res.redirect("back");
  }
};

module.exports.newForm = (req, res) => {
  res.render("camps/new");
};

module.exports.createCamp = async (req, res, next) => {
  try {
    const coords = await geocodeNZ(req.body.camp.location);

    if (!coords) {
      req.flash("error", "Location not found. Please try again.");
      return res.redirect("back");
    }

    const camp = new Camp(req.body.camp);
    camp.geometry = {
      type: "Point",
      coordinates: [coords.lng, coords.lat],
    };

    camp.author = req.user._id;
    camp.images = req.files.map(fileToImage);

    await camp.save();
    req.flash("success", "Successfully made a new camp!");
    res.redirect(`/camps/${camp._id}`);
  } catch (error) {
    req.flash("error", "Error in creating camp: " + error.message);
    return res.redirect("back");
  }
};

module.exports.showCamps = async (req, res) => {
  try {
    const camp = await Camp.findById(req.params.id)
      .populate({ path: "reviews", populate: { path: "author" } })
      .populate("author");

    if (!camp) {
      req.flash("error", "Camp not found");
      return res.redirect("/camps");
    }

    res.render("camps/show", { camp });
  } catch (error) {
    req.flash("error", "Error fetching camp details: " + error.message);
    res.redirect("/camps");
  }
};

module.exports.editForm = async (req, res) => {
  try {
    const { id } = req.params;
    const camp = await Camp.findById(id);
    if (!camp) {
      req.flash("error", "Camp not found");
      return res.redirect("/camps");
    }
    res.render("camps/edit", { camp });
  } catch (error) {
    req.flash("error", "Error fetching camp for editing: " + error.message);
    return res.redirect("/camps");
  }
};

module.exports.updateCamp = async (req, res) => {
  try {
    const { id } = req.params;
    const camp = await Camp.findById(id);

    if (!camp) {
      req.flash("error", "Camp not found");
      return res.redirect("/camps");
    }

    // Ensure the camp is owned by the logged-in user
    if (!camp.author.equals(req.user._id)) {
      req.flash("error", "You must own this Camp to update it");
      return res.redirect(`/camps/${id}`);
    }

    // Update the camp
    Object.assign(camp, req.body.camp);

    // Add new images if any
    camp.images.push(...req.files.map(fileToImage));

    await camp.save();

    // Handle deleting images if requested
    if (req.body.deleteImages) {
      for (let filename of req.body.deleteImages) {
        await destroyImage(filename);
      }
      await camp.updateOne({
        $pull: { images: { filename: { $in: req.body.deleteImages } } },
      });
    }

    req.flash("success", "Successfully Updated Camp!");
    res.redirect(`/camps/${camp._id}`);
  } catch (error) {
    req.flash("error", "Error in updating camp: " + error.message);
    res.redirect("back");
  }
};

module.exports.deleteCamp = async (req, res) => {
  try {
    const { id } = req.params;
    const camp = await Camp.findById(id);

    if (!camp) {
      req.flash("error", "Camp not found");
      return res.redirect("/camps");
    }

    // Delete associated stored images
    for (let image of camp.images) {
      await destroyImage(image.filename);
    }

    await Camp.findByIdAndDelete(id);
    req.flash("success", "Camp Deleted!");
    res.redirect("/camps");
  } catch (error) {
    req.flash("error", "Error in deleting camp: " + error.message);
    res.redirect("/camps");
  }
};

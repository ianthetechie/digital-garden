---
title: Reverse Engineering a Better MapKit Tile Overlay
tags:
- ios
- swift
- apple
- maps
date: 2025-02-11
---

# Reverse Engineering a Better MapKit Tile Overlay

Despite nearly 15 years of developing iOS apps on a daily basis,
it’s occasionally jarring to go back to some of the older APIs.
Today's blog is about [MapKit](https://developer.apple.com/documentation/mapkit/),
which isn't quite as old as CoreGraphics, but dates back to iOS 3.0!
It was a bit slimmer back then, but some of the APIs we'll be looking at today go back to iOS 7!

To set the stage, `MKMapView`, the main "view" in MapKit,
lets you add a sort of minimalist Apple Maps experience to your app in approximately one line of code.
Or no code if you're using Storyboards / Interface Builder.
This is about 100x easier than it is on any other platform I can think of.

But map-centric user experiences almost never stop with just a basemap.
You probably want to throw some data on top, like the outline of an area of interest,
maybe filled in with some color coding.
Or maybe a route line, or a "pin" to show all the nearby hotels and how much they charge per night.
These are all _vector_ data in industry jargon.

One of my former clients was an agricultural tech startup that was later acquired
by a company with a large business related to weather data.
It turns out weather is really important to farmers.
And a lot of weather data, like radar and expected precipitation,
are displayed as a _raster_ overlay on the map.
In this case, usually transparently.

A second use case for overlays is custom cartography.
Apple's maps are fine (superb, actually!) for many use cases,
but you can't customize very much about them.
This might be a dealbreaker if you need something outside the box
like hillshading or ocean depth,
or if you want to swap out the satellite imagery for something more locally up to date.

Overlays are the solution to this too; you can replace the entire base layer with your own!
(Sadly MapKit can't, and probably won't ever support slick vector tile rendering from third-party sources.
Check out [MapLibre Native](https://maplibre.org/) instead for vector basemaps and a whole lot more.)

Today's post is about overlays in MapKit,
some surprising behaviors that I found along the way,
and maybe even a few bits of [ancient wisdom](https://xkcd.com/979/)
to share on StackOverflow.

# A Tale of two MapKits

MapKit has long had support for overlays.
Per [Apple's docs](https://developer.apple.com/documentation/mapkit/mkoverlayrenderer),
it looks like user overlays were added in iOS 7.
But if you poke around closely,
you might notice that the MapKit docs are subtly split into two APIs:
_MapKit for AppKit and UIKit_, and _MapKit for SwiftUI_.

The SwiftUI docs aren't just about a nicer way to use `MKMapView` in your SwiftUI apps;
it's about a completely different API, still under the MapKit umbrella.
In contrast to the old API where you have to implement a delegate just to add something to the map,
the new API is relatively modern.
But it's missing a few things.
And the largest hole of them all is.... you guessed it! No overlays!

To be fair to Apple, the new API is pretty new.
And it probably seems like the use cases for raster overlays are fairly niche,
but I'm a bit confused why Apple dropped this functionality.
So if you're building a live weather radar app,
you need to use the AppKit and UIKit variant of MapKit.
Or MapLibre.

But let's say you actually _do_ need to use MapKit for this purpose?
There are at least two good reasons you might want to:

* **One less dependency**: if you absolutely can't afford a (very few) extra megabytes, MapKit makes sense since it's bundled with the OS.
* **Broad device support**: it's probably possible to build maps with another framework on niche platforms like watchOS and visionOS, but MapKit just works &trade;.

# Diving into `MKTileOverlay`

Ok, let's take a look at the APIs here.
The first one we'll look at is [`MKTileOverlay`](https://developer.apple.com/documentation/mapkit/mktileoverlay).
This is a pretty straightforward class that describes a tile-based data source.
(If you've used maps for a while, you may occasionally notice when the map fills in like a mosaic;
internally it's made up of these "tiles" that are stitched together client-side.)
It has properties describing the valid zoom range
and a few ways of specifying where to get the tiles.

The constructor takes a `urlTemplate` string argument.
The template looks like this: `https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png?api_key=YOUR-API-KEY`.
This is supposed to "just work."
But if you need something a bit more advanced,
you can implement `url(forTilePath:)` instead to return a URL.

This sounds like an "oh, that's nice" sort of API,
but it's surprisingly useful.
For example, they support a `{scale}` placeholder,
but there is no `maximumScale` parameter in the public interface.
For reasons that should be obvious, few if any tile servers
are investing in rendering out PNG tiles at triple the normal resolution,
so `@2x` is the max that most will support.

If you implement `url(forTilePath:)`, the constructor parameter is ignored.
A rather clunky method of encapsulating things,
but I'll give the Apple engineers some slack,
as this dates back to the era when object-oriented programming reigned supreme
and we hadn't rediscovered the joy of protocols yet.

Finally, if you want even _more_ control,
you have `loadTile(at:result:)`, which asynchronously loads the tile data.
This gives you ultimate freedom in how you make your network request,
if you make a network request at all, how you cache tiles, etc.
We'll revisit this in a bit.

# Adding an overlay to the map

Adding an overlay to the map is not quite as straightforward as `mapView.addOverlay(overlay)`.
The design of `MKMapView` is quite flexible... so much so that you _have_ to implement
`mapView(_:rendererFor:)` on your delegate, or else no overlays will render!
Enter [`MKTileOverlayRenderer`](https://developer.apple.com/documentation/mapkit/mktileoverlayrenderer).
The map view itself doesn't know what to do with the overlay.
It _requires_ an overlay renderer to do that, and `MKTileOverlayRenderer` is built for tile overlays like this.

A simple and "obvious" way to bring everything together looks something like this:

```swift
import UIKit
import MapKit

let stadiaApiKey = "YOUR-API-KEY"  // TODO: Get one at client.stadiamaps.com
class ViewController: UIViewController {

    @IBOutlet var mapView: MKMapView!

    override func viewDidLoad() {
        super.viewDidLoad()

        let overlay = MKTileOverlay(urlTemplate: "https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png?api_key=\(stadiaApiKey)")
        mapView.addOverlay(overlay)
    }

}

extension ViewController: MKMapViewDelegate {
    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        if let tileOverlay = overlay as? MKTileOverlay {
            return MKTileOverlayRenderer(overlay: tileOverlay)
        } else {
            return MKOverlayRenderer(overlay: overlay)
        }
    }
}
```

Not too bad, aside from the large amount of boilerplate (also ignoring for the moment that the images aren't scale optimized).
There's just one problem... [the UX is _awful_](https://stackoverflow.com/questions/79286875/mapkit-flashing-screen-each-time-a-zoom-level-is-changed-with-custom-map-tiles-w)!

> [!bug] `addOverlay` docs bug
>
> At the time of this writing, the [docs for `addOverlay`](https://developer.apple.com/documentation/mapkit/mkmapview/addoverlay(_:))
> state that "The map view adds the specified object to the group of overlay objects in the `MKOverlayLevel.aboveLabels` level."
> This is not what actually happens.
> So the above code is theoretically correct, but will be even more surprisingly broken in practice.
> To fix this bug, write `mapView.addOverlay(overlay, level: .aboveLabels)`.


# Fixing the Flash

I initially thought the flashing behavior was a result of a poor cache implementation.
So the first thing I did was to write my own `MKTileOverlay` subclass.
I knew I wanted to provide my own `loadTile(at:result:)` implementation anyways (to load the max _available_ image scale).

After digging into the cache behavior though (and replacing it with my own instance of `URLCache` which I could inspect),
I realized the problem was _not_ the cache responsiveness.

`MKTileRenderer` was the next suspect.
Regrettably, this is a completely closed source library,
so there's no way to know for sure what's going on under the hood,
but I was able to reverse engineer a few things.

First, the problem is _related to_ the way `MKTileOverlayRenderer`
implements `canDraw(_:zoomScale:)` and `draw(_:zoomScale:in:)`.
The class seems to indicate that it can't draw anything when the data is not available at this exact zoom level.
This is rather annoying,
since the entire map will disappear and then rapidly fill in every time you cross over a zoom boundary!

Which means we have to go even deeper.
Time to implement our own overlay renderer!

The overall approach I settled on for the first (and fortunately only!) pass
was to leave `canDraw(_:zoomScale:)` unimplemented, so it will always try to draw something.
For the draw method, my goal was to put cache hits directly in the hot path,
and kicking off async requests in case something wasn't in the cache.

Here's most of the code:

```swift
/// A generic protocol for MapKit tile overlays which implement their own queryable cache.
///
/// This is useful for making overlays more responsive, and allowing for fallback tiles
/// to be fetched by the renderer while waiting for the higher zoom tiles to load over the network.
/// While technically not required, it's easiest to just subclass `MKTileOverlay`.
public protocol CachingTileOverlay: MKOverlay {
    /// Fetches a tile from the cache, if present.
    ///
    /// This method should retorn as quickly as possible.
    func cachedData(at path: MKTileOverlayPath) -> Data?
    func loadTile(at path: MKTileOverlayPath, result: @escaping (Data?, (any Error)?) -> Void)

    var tileSize: CGSize { get }
}

public class CachingTileOverlayRenderer: MKOverlayRenderer {
    private var loadingTiles = AtomicSet<String>()

    public init(overlay: any CachingTileOverlay) {
        super.init(overlay: overlay)
    }

    public override func draw(_ mapRect: MKMapRect, zoomScale: MKZoomScale, in context: CGContext) {
        // Shift the type; our constructor ensures we can't get this wrong by accident though.
        guard let tileOverlay = overlay as? CachingTileOverlay else {
            fatalError("The overlay must implement MKCachingTileOverlay")
        }

        // (Snipped) Calculate the range of tiles the mapRect intersects

        // Loop over the tiles that intersect mapRect...
        for x in firstCol...lastCol {
            for y in firstRow...lastRow {
                // Create the tile overlay path
                let tilePath = MKTileOverlayPath(x: x, y: y, z: currentZoom, contentScaleFactor: self.contentScaleFactor)

                if let image = cachedTileImage(for: tilePath) {
                    // (Snipped) Compute tile rect
                    let drawRect = self.rect(for: tileRect)
                    // If we have a cached image for this tile, just draw it!
                    drawImage(image, in: drawRect, context: context)
                } else {
                    // Miss; load the tile
                    loadTileIfNeeded(for: tilePath, in: tileRect)
                }
            }
        }
    }

    func cachedTileImage(for path: MKTileOverlayPath) -> ImageType? {
        guard let overlay = self.overlay as? CachingTileOverlay else { return nil }
        if let data = overlay.cachedData(at: path) {
            return ImageType(data: data)
        }
        return nil
    }

    func loadTileIfNeeded(for path: MKTileOverlayPath, in tileMapRect: MKMapRect) {
        guard let overlay = self.overlay as? CachingTileOverlay else { return }

        // Create a unique key for the tile (MKTileOverlayPath is not hashable)
        // and use this to avoid duplicate requests.
        let tileKey = "\(path.z)/\(path.x)/\(path.y)@\(path.contentScaleFactor)"
        guard !loadingTiles.contains(tileKey) else { return }

        loadingTiles.insert(tileKey)

        overlay.loadTile(at: path) { [weak self] data, error in
            guard let self = self else { return }
            self.loadingTiles.remove(tileKey)

            // When the tile has loaded, schedule a redraw of the tile region.
            DispatchQueue.main.async {
                self.setNeedsDisplay(tileMapRect)
            }
        }
    }
}
```

It worked!
Well, almost...

![A map with elements upside down and badly stitched](images/mapkit-flipped-tiles.png)

That was my first attempt at grabbing the `cgImage` property of a `UIImage`
and slapping it onto the context.
The `drawImage` function ended up being rather annoying for both UIKit and AppKit.

```swift
// At the top of your file
#if canImport(UIKit)
typealias ImageType = UIImage
#elseif canImport(AppKit)
typealias ImageType = NSImage
#endif

// Later, inside the overlay renderer...

func drawImage(_ image: ImageType, in rect: CGRect, context: CGContext) {
#if canImport(UIKit)
    UIGraphicsPushContext(context)

    image.draw(in: rect)

    UIGraphicsPopContext()
#elseif canImport(AppKit)
    let graphicsContext = NSGraphicsContext(cgContext: context, flipped: true)

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphicsContext
    image.draw(in: rect)
    NSGraphicsContext.restoreGraphicsState()
#endif
}
```

Not very pretty (especially with the conditional compilation to support macOS), but it gets the job done.

One more wart to acknowledge...this approach requires a bit of faith in `URLCache` being responsive.
But it got rid of the flicker, and I think that's the bigger win.

> [!question] What about the snipped code?!
>
> Yeah, I skipped over a bunch of math to calculate some rectangles.
> It wasn't very interesting, and this is a LONG post.
> You can find the [full code on GitHub](https://github.com/stadiamaps/mapkit-caching-tile-overlay/blob/main/Sources/CachingMapKitTileOverlay/CachingTileOverlayRenderer.swift).

# Implementing `CachingTileOverlay`

After some minimal testing, it became clear that the default caching behavior
was not going to cut it.
We can't see the source code, but it looks like internally,
Apple either uses `URLSession.shared` or sets up a new session with caching behavior similar to `URLCache.shared`.
This, somewhat understandably, doesn't do much if any disk caching.
But map users expect data to be cached for snappy app relaunches!

I ended up setting up a cache like this:

```swift
let cache = URLCache(memoryCapacity: 25 * 1024 * 1024, diskCapacity: 100 * 1024 * 1024)
```

It's not entirely clear when exactly the memory contents are flushed to disk, but this is a big improvemnet already.
Don't forget to configure your `URLSession` to use the new cache!
I set up the session as in instance variable that's configured during `init`.

```swift
self.urlSession = URLSession(configuration: configuration)
```

Next, we need to actually create the request and load it in `loadTile(at:result:)`.

```swift
public override func loadTile(at path: MKTileOverlayPath, result: @escaping (Data?, (any Error)?) -> Void) {
    let url = self.url(forTilePath: path)
    let request = URLRequest(url: url, cachePolicy: cachePolicy)

    if let response = cache.cachedResponse(for: request) {
        result(response.data, nil)
        return
    }

    urlSession.dataTask(with: request) { data, _, error in
        result(data, error)
    }.resume()
}
```

Nothing super special here.
But it's worth noting I also made `cachePolicy` an instance variable for extra configuability.
And that's pretty much all the interesting bits in the overlay.

> [!tip] `canReplaceMapContent`
>
> If you're implementing a basemap layer with this approach, make sure you set `canReplaceMapContent`!
> This lets `MapKit` skip drawing all layers underneath yours.
> Don't do this if you're just adding a transparent overlay on top.

For a full implementation of an overlay,
check out [this one for Stadia Maps raster layers](https://github.com/stadiamaps/mapkit-layers).

# Going for Gold: Overzooming

With the zoom transition "flicker" solved for cases where the tile was already in the cache,
I noticed there was another problem with `MKTileOverlayRenderer`.
It refuses to show tiles from anything but the current zoom level.
This causes a jarring effect when zooming in, as the map is erased and slowly redrawn
as new (non-cached) tiles are loaded.

`MapKit` is the first framework I can recall seeing with this behavior.
Other frameworks will just "overzoom" the existing tiles.
I was able to overcome this, but admittedly it required quite a lot of hackery.
The first thing we need to change is our drawing method.
It needs a fallback case.

```swift
if let image = cachedTileImage(for: tilePath) {
    // If we have a cached image for this tile, just draw it!
    drawImage(image, in: drawRect, context: context)
} else if let fallbackImage = fallbackTileImage(for: tilePath) {
    // If we have a fallback image, draw that instead to start.
    drawImage(fallbackImage, in: drawRect, context: context)

    // Then, load the tile from the cache (if necessary)
    loadTileIfNeeded(for: tilePath, in: tileRect)
} else {
    // Total cache miss; load the tile
    loadTileIfNeeded(for: tilePath, in: tileRect)
}
```

Nothing too surprising here.
We try to load a fallback image, and THEN kick off the tile fetch.
The majority of the logic lives in `fallbackTileImage(for:)`:

```swift
/// Attempts to get a fallback tile image from a lower zoom level.
///
/// The idea is to try successively lower zoom levels until we find a tile we have cached,
/// then use it until the real tile loads.
func fallbackTileImage(for path: MKTileOverlayPath) -> ImageType? {
    var fallbackPath = path
    var d = 0
    while fallbackPath.z > 0 && d < 2 {  // We'll go up to 2 levels higher
        d += 1
        fallbackPath = fallbackPath.parent

        if let image = cachedTileImage(for: fallbackPath) {
            let srcRect = cropRect(d: d, originalPath: path, imageSize: image.size)

            return image.cropped(to: srcRect)
        }
    }
    return nil
}
```

This code looks for cached tiles up to 2 levels "higher up."
If it finds one, it returns that image to be temporarily rendered as a stand-in.
This method in turn relies on two more methods:
an extension on `MKTileOverlayPath` to get the parent tile,
and a `cropRect` function which returns a sub-rectangle of the fallback image
which we want to display.

In digital maps, the map is subdivided into tiles.
At zoom level 0, the whole world is a single tile.
Every time you zoom in a level, each tile is subdivided into 4.
This property lets us use a previously loaded image from a lower zoom level as a stand-in.

This took **way** too much trial and error to get right.
First, we need to do some math to calculate which section of the cached image we should crop to and "overzoom."
Then we need to actually crop the image, which is easier said than done.
Neither `UIImage` nor `NSImage` provide a cropping API directly,
so we need to drop down to `CoreGraphics`.

To make matters worse, AppKit and UIKit somewhat infamously use different coordinate systems,
with the origins in different spots.
So our cropping functions OR our rect calculation need to be aware of the difference.

This code is not particularly interesting to be honest,
but here are links to the files on GitHub:

* [Cropping rectangle](https://github.com/stadiamaps/mapkit-caching-tile-overlay/blob/main/Sources/CachingMapKitTileOverlay/CachingTileOverlayRenderer.swift) (search for `cropRect`)
* [Image extension](https://github.com/stadiamaps/mapkit-caching-tile-overlay/blob/main/Sources/CachingMapKitTileOverlay/Cropping.swift)

> [!question] What about zooming out?
>
> I currently don't apply the same tricks when zooming out.
> As you zeem out, MapKit still clears tiles rather than showing smaller versions of what it has already.
> This is a trickier problem since, while each child has exactly one parent tile,
> when you go in reverse, the task is to load 4 tiles and stitch them together.
> PRs welcome if anyone wants to take a swing!

# Conclusion

Mapkit is full of surprises.
While it works pretty well out of the box with a vanilla map style from Apple on a fast network,
something as simple as adding raster overlays can be devilishly complicated.
Here's to hoping that Apple eventually publishes the source code for MapKit.
I would happily sobmit some PRs to improve it,
including adding support for overlays in the SwiftUI API!

In the meantime, I've published a Swift package
with the caching overlay and renderer outlined in this post.
[Check it out on GitHub](https://github.com/stadiamaps/mapkit-caching-tile-overlay/tree/main).

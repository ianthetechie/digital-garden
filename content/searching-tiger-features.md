---
title: Searching for TIGER Features
tags:
- gis
- shell
- ogr2ogr
date: 2024-11-09
---

Today I had a rather peculiar need to search through features from TIGER
matching specfiic attributes.
These files are not CSV or JSON, but rather ESRI Shapefiles.
Shapefiles are a binary format which have long outlived their welcome
according to many in the industry, but they still persist today.

# Context

Yeah, so this post probably isn't interesting to very many people,
but here's a bit of context in case you don't know what's going on and you're still reading.
TIGER is a geospatial dataset published by the US government.
There's far more to this dataset than fits in this TIL post,
but my interest in it lies in finding addresses.
Specifically, *guessing* at where an address might be.

When you type an address into your maps app,
they might not actually have the exact address in their database.
This happens more than you might imagine,
but you can usually get a pretty good guess of where the address is
via a process called interpolation.
The basic idea is that you take address data from multiple sources and use that to make a better guess.

Some of the input to this is existing address points.
But there's one really interesting form of data that brings us to today's TIL:
address ranges.
One of the TIGER datasets is a set of lines (for the roads.
Each segment is annotated with info letting us know the range of house numbers on each side of the road.

I happen to use this data for my day job at Stadia Maps,
where I was investigating a data issue today related to our geocoder and TIGER data.

# Getting the data

In case you find yourself in a similar situation,
you may notice that the data from the government is sitting in an FTP directory,
which contains a bunch of confusingly named ZIP files.
The data that I'm interested in (address features)
has names like `tl_2024_48485_addrfeat.zip`.

The year might be familiar, but what's that other number?
That's a FIPS code for the county whose data is contained in the archive.
You can find a [list here](https://transition.fcc.gov/oet/info/maps/census/fips/fips.txt).
This is somewhat interesting in itself, since the first 2 characters are a state code.
Texas, in this case.
The full number makes up a county: Wichita County, in this case.
You can suck down the entire dataset, just one file, or anything in-between
from the [Census website](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html).

# Searching for features

So, now you have a directory full of ZIP files.
Each of which has a bunch of files necessary to interpret the shapefile.
Isn't GIS lovely?

The following script will let you write a simple "WHERE" clause,
filtering the data exactly as it comes from the Census Bureau!

```bash
#!/bin/bash
set -e;

find "$1" -type f -iname "*.zip" -print0 |\
  while IFS= read -r -d $'\0' filename; do

    filtered_json=$(ogr2ogr -f GeoJSON -t_srs crs:84 -where "$2" /vsistdout/ /vsizip/$filename);
    # Check if the filtered GeoJSON has any features
    feature_count=$(echo "$filtered_json" | jq '.features | length')

    if [ "$feature_count" -gt 0 ]; then
      # echo filename to stderr
      >&2 echo $(date -u) "Match(es) found in $filename";
      echo "$filtered_json";
    fi

  done;
```


You can run it like so:

```shell
./find-tiger-features.sh $HOME/Downloads/tiger-2021/ "TFIDL = 213297979 OR TFIDR = 213297979"
```

This ends up being a LOT easier and faster than QGIS in my experience
if you want to search for specific known attributes.
Especially if you don't know the specific area that you're looking for.
I was surprised that so such tool for things like ID lookps existed already!

Note that this isn't exactly "fast" by typical data processing workload standards.
It takes around 10 minutes to run on my laptop.
But it's a lot faster than the alternatives in many circumstances,
especilaly if you don't know exactly which file the data is in!

For details on the fields available,
refer to the technical documentation on the [Census Bureau website](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html).

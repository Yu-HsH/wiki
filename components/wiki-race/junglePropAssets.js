// Native scene coordinates and motion values from the approved v3 demo.
export const junglePropAssets = {
  "landing": [
    {
      "id": "lantern",
      "pivot": [
        127,
        716
      ],
      "patch": {
        "file": "lantern-repair.png",
        "box": [
          52,
          528,
          147,
          215
        ]
      },
      "sprite": {
        "file": "lantern-body.png",
        "box": [
          79,
          553,
          97,
          173
        ]
      },
      "flame": {
        "file": "lantern-flame.png",
        "box": [
          111,
          643,
          35,
          39
        ]
      },
      "flamePivot": [
        127,
        677
      ],
      "glassPath": "M127 641 C135 648 143 653 145 662 C145 672 137 681 128 680 C119 682 110 674 110 664 C110 654 119 649 127 641 Z",
      "light": [
        127,
        664
      ],
      "idle": [
        "rotate(-0.65deg)",
        "rotate(0.65deg)"
      ],
      "period": 4700,
      "phase": -620,
      "click": [
        "rotate(2.9deg)",
        "rotate(-1.3deg)"
      ],
      "press": 760
    }
  ],
  "home": [
    {
      "id": "marker-one",
      "pivot": [
        591.5,
        291
      ],
      "patch": {
        "file": "flag-one-repair.png",
        "box": [
          579,
          254,
          90,
          82
        ]
      },
      "sprite": {
        "file": "flag-one-sprite.png",
        "box": [
          587,
          266,
          69,
          58
        ]
      },
      "idle": [
        "skewY(-2deg) scaleX(0.9909)",
        "skewY(2deg) scaleX(0.9818)"
      ],
      "period": 4100,
      "phase": -370,
      "click": [
        "skewY(-8.5deg) scaleX(0.922)",
        "skewY(3.7deg) scaleX(0.9766)"
      ],
      "press": 690
    },
    {
      "id": "marker-two",
      "pivot": [
        1208.2,
        236
      ],
      "patch": {
        "file": "flag-two-repair.png",
        "box": [
          1196,
          200,
          90,
          78
        ]
      },
      "sprite": {
        "file": "flag-two-sprite.png",
        "box": [
          1204,
          212,
          69,
          53
        ]
      },
      "idle": [
        "skewY(-1.65deg) scaleX(0.9909)",
        "skewY(1.65deg) scaleX(0.9818)"
      ],
      "period": 5300,
      "phase": -2310,
      "click": [
        "skewY(-8deg) scaleX(0.922)",
        "skewY(3.2deg) scaleX(0.9766)"
      ],
      "press": 720
    },
    {
      "id": "marker-three",
      "pivot": [
        1482,
        147
      ],
      "patch": {
        "file": "flag-three-repair.png",
        "box": [
          1470,
          110,
          65,
          84
        ]
      },
      "sprite": {
        "file": "flag-three-sprite.png",
        "box": [
          1478,
          123,
          57,
          57
        ]
      },
      "idle": [
        "skewY(-2.2deg) scaleX(1)",
        "skewY(2.2deg) scaleX(1)"
      ],
      "period": 6800,
      "phase": -1540,
      "click": [
        "skewY(-9deg) scaleX(1)",
        "skewY(3.5deg) scaleX(1)"
      ],
      "press": 770
    }
  ]
};
